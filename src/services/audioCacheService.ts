import { openDB, IDBPDatabase } from 'idb';

interface CachedAudioChunk {
  id: string;
  audioBlob: Blob;
  timestamp: number;
  messageId: string;
  sequence: number;
}

interface CachedConversationState {
  id: string;
  lastMessageId: string;
  lastAudioPosition: number;
  partialResponse: string;
  timestamp: number;
}

interface StoreSchema {
  [AUDIO_STORE]: CachedAudioChunk;
  [STATE_STORE]: CachedConversationState;
}

const DB_NAME = 'stoic-mentor-cache';
const DB_VERSION = 1;
const AUDIO_STORE = 'audio-chunks';
const STATE_STORE = 'conversation-states';
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

class AudioCacheService {
  private db: IDBPDatabase<StoreSchema> | null = null;

  async initialize(): Promise<void> {
    if (this.db) return;

    this.db = await openDB<StoreSchema>(DB_NAME, DB_VERSION, {
      upgrade(db: IDBPDatabase<StoreSchema>) {
        // Audio chunks store
        if (!db.objectStoreNames.contains(AUDIO_STORE)) {
          const audioStore = db.createObjectStore(AUDIO_STORE, { keyPath: 'id' });
          audioStore.createIndex('messageId', 'messageId');
          audioStore.createIndex('timestamp', 'timestamp');
        }

        // Conversation state store
        if (!db.objectStoreNames.contains(STATE_STORE)) {
          const stateStore = db.createObjectStore(STATE_STORE, { keyPath: 'id' });
          stateStore.createIndex('timestamp', 'timestamp');
        }
      }
    });

    // Cleanup old cache entries
    await this.cleanup();
  }

  async cacheAudioChunk(
    messageId: string,
    audioBlob: Blob,
    sequence: number
  ): Promise<string> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const chunk: CachedAudioChunk = {
      id: `${messageId}-${sequence}`,
      audioBlob,
      messageId,
      sequence,
      timestamp: Date.now()
    };

    await this.db.put(AUDIO_STORE, chunk);
    return chunk.id;
  }

  async getAudioChunks(messageId: string): Promise<Blob[]> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const chunks = await this.db.getAllFromIndex(AUDIO_STORE, 'messageId', messageId);
    return chunks
      .sort((a: CachedAudioChunk, b: CachedAudioChunk) => a.sequence - b.sequence)
      .map((chunk: CachedAudioChunk) => chunk.audioBlob);
  }

  async saveConversationState(
    conversationId: string,
    lastMessageId: string,
    lastAudioPosition: number,
    partialResponse: string
  ): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const state: CachedConversationState = {
      id: conversationId,
      lastMessageId,
      lastAudioPosition,
      partialResponse,
      timestamp: Date.now()
    };

    await this.db.put(STATE_STORE, state);
  }

  async getConversationState(conversationId: string): Promise<CachedConversationState | null> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    return await this.db.get(STATE_STORE, conversationId);
  }

  async cleanup(): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const now = Date.now();
    const oldTimestamp = now - MAX_CACHE_AGE_MS;

    // Cleanup old audio chunks
    await this.cleanupStore(AUDIO_STORE, oldTimestamp);
    await this.cleanupStore(STATE_STORE, oldTimestamp);
  }

  private async cleanupStore(storeName: 'audio-chunks' | 'conversation-states', oldTimestamp: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const tx = this.db.transaction(storeName, 'readwrite');
    const index = tx.store.index('timestamp');
    let cursor = await index.openCursor(IDBKeyRange.upperBound(oldTimestamp));
    
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
  }

  async clearCache(): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    await this.db.clear(AUDIO_STORE);
    await this.db.clear(STATE_STORE);
  }
}

export const audioCacheService = new AudioCacheService(); 