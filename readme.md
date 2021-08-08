# DAGedit
A real-time save editor for Sly 2 and Sly 3.

<img src="thumb.png" alt="A screenshot of DAGedit." style="float: right; margin: 10px; width: 300px">

## Features
* Explore the DAG and view node connections
* View the state of each task in real-time
* Right-click a task to edit its state
* Export the graph to a DOT language file
* Export the current view to a PNG image

## Planned Features
* Readable names based on task descriptions
* Changes to DAG persist between reloads

## Getting Started
Clone the repo, run `npm install` to download dependencies, then `npm start` to launch the app. You can also build the exe with `npm run-script build`, or download a release version from the [Releases](https://github.com/TheOnlyZac/DAGedit/releases/) tab.

Make sure PCSX2 is running and Sly 2 or 3 (NTSC) is loaded, or else the app won't open. It will take a moment to populate the DAG.

When the window appears, if you do not see the graph, it is probably off screen. Zoom out with the scroll wheel, and click/drag to pan the graph.

## About the DAG
Each node corresponds to a task, and tasks are color coded by their state:
* Red is Unavailable (0)
* Green is Available (1)
* Blue is Complete (2)
* Gray is Final (3)

Each node displays it's address in memory. Nodes also have descriptive names in the game's code, but as of now there is no method to automatically associate a node with its name.

Diamond-shaped tasks have checkpoints. When you die, you respawn at the last targeted checkpoint.

Each box/cluster of tasks is one job. Once a job is finished, all the Complete tasks are set to Final.

# Further Reading
For more information on the structure and function of the DAG, see [The Picture Worth a Thousand Bugs](https://youtu.be/Yl20uIQ3fEw), a GDC 2005 presentation by Bruce Oberg (lead programmer on Sly 2).
