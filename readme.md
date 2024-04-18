# DAGviz

DAGviz is a game-state viewer/editor for [Sly 2](https://en.wikipedia.org/wiki/Sly_2:_Band_of_Thieves) and [Sly 3](https://en.wikipedia.org/wiki/Sly_3:_Honor_Among_Thieves) using memory.js and graphviz. Downloads are available on the [Releases](https://github.com/theonlyzac/dagviz/releases/) tab.

<img src="img/thumb.png" alt="A screenshot of DAGviz." align="right" style="float: right; margin: 10px; width: 400px">

## Features

* Explore the DAG and see task connections
* Watch task states update in real-time
* Right-click a task to edit its state
* Export the graph to a DOT language file
* Export the current view to a PNG image

### Planned Features

* Plain-english node labels based on task descriptions
* Changes to DAG persist between reloads

## Instructions

Use the scroll wheel to zoom, and click + drag to pan the current view.

Right click a node to see some options such as copying the memory address of the node, change its state, or export the current DAG

## Building from source

```bash
git clone https://github.com/theonlyzac/dagviz
npm install # install dependencies
npm start # run the app
```

Then build the exe with `npm run-script build`.

## Troubleshooting

Make sure PCSX2 is open and Sly 2 or 3 (NTSC) is running. It may take a moment to populate the DAG.

If it says the correct episode in the top-left but you do not see the DAG, it is probably off-screen. Zoom out with the scroll wheel, and/or click+drag to find it.

If it is not detecting that the game is running, uncheck the "Auto-detect build" box and set the game build manually. Please submit an [issue](https://github.com/theonlyzac/dagviz/issues/) saying which build and which map you were playing on.

## About the DAG

Each node corresponds to a task, and tasks are color-coded by their state:
| Value      | State         | Color   |
|------------|---------------|---------|
| 0          | Unavailable   | <span style="color: red;">Red</span>    |
| 1          | Available     | <span style="color: green;">Green</span> |
| 2          | Complete      | <span style="color: blue;">Blue</span>   |
| 3          | Final         | <span style="color: lightgray;">Gray</span> |

By default, each node displays it's unique ID. You can change this using the "Nodes display" option. Nodes have plain-english names in the game's code, but there is no known method to extract those from the game, so the ID is the next best thing.

Diamond-shaped tasks have checkpoints. When you die, you respawn at the last active checkpoint.

Each box/cluster of tasks is a "mission". Once you complete the exit task for a mission, all the Complete tasks in that job get set to Final.

## Further Reading

[The Picture Worth a Thousand Bugs](https://youtu.be/Yl20uIQ3fEw) - GDC 2005 presentation by Bruce Oberg (lead programmer on Sly 2) on the structure and implementation of the DAG.
