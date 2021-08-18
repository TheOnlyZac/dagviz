# Changelog

## v0.5.0
* App doesn't crash when PCSX2 or Sly aren't running
* Added task names/descriptions for Sly2 Ep1 and Ep3
  - Special thanks to Sami for helping identify tasks
* Tweaked graph appearance
* Added app icon and custom titlebar
* Temporarily removed state forcing (broken)

## v0.4.0
* Added support for Sly 3: Honor Among Thieves
* Nodes now display their unique ID rather than their memory address
* Added context menu options:
  - Copy node address to clipboard
  - Refresh graph (for when it breaks)
  - Export graph as DOT text
  - Export current view as PNG
* Minor tweaks/adjustments

## v0.3.0
* Added context menu to force task states
  - Forcing a task state recursively updates the DAG (WIP)
* Fixed bug where Episode 3 DAG didn't render #1
* Minor tweaks/adjustments

## v0.2.0
* Tweaked window style
* Resolved #3 window resizing issues
* Added Episode ID in the top left corner
* Set cursor to hourglass while the graph is updating

## v0.1.0
* Initial version