# DAGedit
A real-time save editor for Sly 2 and Sly 3.

<img src="thumb.png" alt="A screenshot of DAGedit." style="float: right; margin: 10px; width: 300px">

## Features
* Explore the DAG and view node connections
* View the state of each task in real-time
* Right-click a task to edit its state
* Nodes display their address in memory

## Planned Features
* Export the current DAG to a PNG or DOT language file
* Readable names based on task descriptions
* Changes to DAG persist between reloads

## Getting Started
To compile, use `npm run-script build`. You can also download a release version from the [Releases](https://github.com/TheOnlyZac/DAGedit/releases/) tab.

Make sure PCSX2 is running and Sly 2 NTSC is loaded, then run `DAGedit.exe`. It will take a moment to populate the DAG.

When the window appears, if you do not see the graph, it is probably off screen. Zoom out with the scroll wheel, and click/drag to pan the graph.

## About the DAG
Each node corresponds to a task, and tasks are color coded by their state:
* Red is Unavailable (0)
* Green is Available (1)
* Blue is Complete (2)
* Gray is Final (3)

Diamond-shaped nodes have checkpoints. When you die, you respawn at the last targeted checkpoint.

Each box/cluster of nodes is one job. Once a job is finished, all the Complete nodes are set to Final.

# Further Reading
For more information on the structure and function of the DAG, see [The Picture Worth a Thousand Bugs](https://youtu.be/Yl20uIQ3fEw), a GDC 2005 presentation by Bruce Oberg (lead programmer on Sly 2).