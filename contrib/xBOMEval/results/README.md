# Introduction

This directory captures the raw test results from various models over time.

## 5 Aug 2025

### Logic Category Comparison

```mermaid
%%{init: {'theme': 'base'}}%%
barChart
    title Logic Category Comparison
    x-axis Model
    y-axis Accuracy (%)
    "cdx1-mlx-8bit" : 46.04
    "cdx1-pro-mlx-8bit" : 73.17
    "gemini-2.5-pro"  : 93.6
    "o4-mini-high"   : 67.99
    "qwen3-coder-480B": 48.48
```

### Spec Category Comparison

```mermaid
%%{init: {'theme': 'base'}}%%
barChart
    title Spec Category Comparison
    x-axis Model
    y-axis Accuracy (%)
    "cdx1"             : 32.53
    "cdx1-pro"         : 48.86
    "gemini-2.5-pro"   : 100
    "o4-mini-high"     : 0
    "qwen3-coder-480B" : 90.34
```

### Other categories

| category | cdx1-mlx-8bit | cdx1-pro-mlx-8bit |
|----------|---------------|-------------------|
| devops | 87.46% | 96.1% |
| docker | 89.08% | 100% |
| linux | 90.6% | 95.8% |
