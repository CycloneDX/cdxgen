# Introduction

This directory captures the raw test results from various models over time.

## 5 Aug 2025

### Logic Category Comparison

```mermaid
%%{init: {'theme': 'base'}}%%
xychart-beta
    title "Logic Category Comparison"
    x-axis [cdx1-mlx-8bit, cdx1-pro-mlx-8bit, gemini-2.5-pro, o4-mini-high, qwen3-coder-480B]
    y-axis "Accuracy (%)" 0 --> 100
    bar [46.04, 73.17, 93.6, 67.99, 48.48]
```

### Spec Category Comparison

```mermaid
%%{init: {'theme': 'base'}}%%
xychart-beta
    title "Spec Category Comparison"
    x-axis [cdx1-mlx-8bit, cdx1-pro-mlx-8bit, gemini-2.5-pro, o4-mini-high, qwen3-coder-480B]
    y-axis "Accuracy (%)" 0 --> 100
    bar [32.53, 48.86, 100, 0, 90.34]
```

### Other categories

| category | cdx1-mlx-8bit | cdx1-pro-mlx-8bit |
|----------|---------------|-------------------|
| devops | 87.46% | 96.1% |
| docker | 89.08% | 100% |
| linux | 90.6% | 95.8% |
