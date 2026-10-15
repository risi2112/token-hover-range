# Token Hover Range

A small Foundry VTT (V14) module: hover over any token to see how far it is from your token.

## Which token it measures from

1. Your **selected** token(s). If you have more than one selected, the nearest one is used.
2. Players with nothing selected: their **assigned character's** token, or failing that, any token they own.
3. The GM: only the selected token by default. Can be switched to the **nearest player-owned token** in settings.

## Settings (per player)

- **Show distance on hover**: on / off. There's also an unbound keybinding to toggle it.
- **Measure between**: *Nearest spaces* (default, D&D-style: adjacent tokens are 5 ft apart, large creatures
  measure from their closest square) or *Token centers*. Gridless scenes always use centers.
- **Include elevation**: counts height differences, including tokens on different scene levels.
- **GM measures from**: selected token only (default), or nearest player-owned token.

Distances use the scene's own grid rules, so diagonal rules and units match Foundry's ruler.
