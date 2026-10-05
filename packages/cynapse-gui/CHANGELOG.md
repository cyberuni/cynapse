# @cyberuni/cynapse-gui

## 0.1.0

### Minor Changes

- e5f3c3c: Add `cynapse gui`, which opens the Council's web viewer on the current database. The viewer
  ships separately as `@cyberuni/cynapse-gui`; install it next to cynapse to use the command.

### Patch Changes

- 33717b2: Add `Store.appendUnless`, which appends an entry only if no entry in the channel matches a condition,
  checked in the same write transaction that assigns `seq`. The GUI rules on a decision with it, so two
  rulings submitted at once can no longer both land.
- Updated dependencies [33717b2]
- Updated dependencies [84cfb55]
- Updated dependencies [f368905]
- Updated dependencies [bddf82e]
- Updated dependencies [1d9cd3c]
- Updated dependencies [4d561a5]
- Updated dependencies [eb729d7]
- Updated dependencies [e5f3c3c]
- Updated dependencies [dd9f0cb]
- Updated dependencies [973eb91]
- Updated dependencies [fe7403c]
- Updated dependencies [3bc8e38]
- Updated dependencies [fa5c956]
- Updated dependencies [5293ef3]
- Updated dependencies [33d6b9c]
- Updated dependencies [d86cdf3]
- Updated dependencies [ad30ecf]
- Updated dependencies [acbbfba]
- Updated dependencies [448e3a7]
- Updated dependencies [6ac5b3f]
  - cynapse@0.1.0
