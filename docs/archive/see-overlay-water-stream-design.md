# `see` Water + Stream Overlay

This change would make `see` produce a single debug image that keeps terrain height as the grayscale base, shades standing water in blue based on depth, and draws stream paths on top. The result is a faster visual check of terrain shape, pooled water, and drainage behavior without switching between separate views.

## What is being requested

Add an overlay option to `see`:

`--overlay water,stream`

The command should still use the terrain height map as the background image. The background is grayscale, where darker means lower ground and lighter means higher ground.

## Desired visual behavior

1. Water overlay:
- Use each tile's water depth to tint the tile blue.
- If water depth is `1`, the tile should be fully saturated blue.
- If water depth is between `0` and `1`, the tile should be a proportional mix of blue and the underlying grayscale terrain.
- If there is no water depth, the tile should remain the underlying grayscale color.

2. Stream overlay:
- Show streams on top of the terrain/water result so stream paths are clearly visible.
- This should work together with the water overlay when both are enabled.

## Intent

The purpose is to make `see` useful for fast visual inspection of terrain height, standing water depth, and stream routing in a single rendered image.
