
import os
os.environ['DISABLE_TRITON'] = '1'
os.environ['NO_TORCH_COMPILE'] = '1'

import torch
import torch.nn as nn

class MockModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.linear = nn.Linear(10, 10)
    
    def forward(self, x):
        return self.linear(x)
    
    @classmethod
    def from_pretrained(cls, model_id):
        return cls()
    
    def setup_caches(self, max_batch_size, dtype=None):
        pass
    
    def reset_caches(self):
        pass
    
    def caches_are_enabled(self):
        return True
