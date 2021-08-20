'use strict'

// Import packages
const { app, BrowserWindow, webContents } = require('electron');
const ipc = require('electron').ipcMain;
const path = require('path');
const memoryjs = require('memoryjs');
const fs = require('fs');

// Set up memoryjs vars
let processObject;
const memoryBase = 0x20000000

// Possible task states
const UNAVAILABLE = 0;
const AVAILABLE = 1;
const COMPLETE = 2;
const FINAL = 3;

// Game/Build ID
let GAME = -1;
let BUILD = -1;

const BUILDS = Object.freeze({
    none: -1,
    sly2ntsc: 0,
    sly3ntsc: 1,
    sly2mar: 2,
    sly3aug: 3,
    sly3sep: 4
});

// Settings
let autoDetectBuild = true;
let nodesDisplay = 'name';

// Declare DAG and tasks dict
let dag;
let tasks = {};

// Define graph classes
class Node {

    static oId = [0x18, 0x18];
    static oState = [0x54, 0x44];
    static oNumChildren = [0xa0, 0x90];
    static oChildrenArray = [0xa4, 0x94];
    static oNumParents = [0x94, 0x84];
    static oParentsArray = [0x98, 0x88];
    static oJob = [0x7c, 0x6c];
    static oCheckpoint = [0xb8, 0xa8];

    constructor(address) {
        this.address = address;

        // we only populate the edges array once bc we assume it won't change
        this.edges = this.children;
    }

    get id() {
        return readMemory(this.address + Node.oId[GAME], memoryjs.UINT32);
    }

    // get the current state of the task (0, 1, 2, 3)
    get state() {
        return readMemory(this.address + Node.oState[GAME], memoryjs.UINT32);
    }
    s

    set state(val) {
        writeMemory(this.address + Node.oState[GAME], val, memoryjs.UINT32);
    }

    get children() {
        let children = []
        let numChildren = readMemory(this.address + Node.oNumChildren[GAME], memoryjs.UINT32);
        let childrenArray = readMemory(this.address + Node.oChildrenArray[GAME], memoryjs.UINT32); // retail: a4, proto: 98
        for (let i = 0; i < numChildren; i++) {
            children.push(readMemory(childrenArray + i*4, memoryjs.UINT32));
        }
        return children;
    }

    get parents() {
        let parents = []
        let numParents = readMemory(this.address + Node.oNumParents[GAME], memoryjs.UINT32);
        let parentsArray = readMemory(this.address + Node.oParentsArray[GAME], memoryjs.UINT32); // retail: a4, proto: 98
        for (let i = 0; i < numParents; i++) {
            parents.push(readMemory(parentsArray + i*4, memoryjs.UINT32));
        }
        return parents;
    }

    // get the job pointer for the task
    get job() {
        return readMemory(this.address + Node.oJob[GAME], memoryjs.UINT32); //retail
        //return readMemory(this.address + 0x74, memoryjs.UINT32); //proto
    }

    // get the checkpoint for this node
    get checkpoint() {
        return readMemory(this.address + Node.oCheckpoint[GAME], memoryjs.UINT32);
    }

    // get the tasks's name based on its ID
    get name() {
        if ((BUILD == BUILDS.sly2ntsc) && (this.id in tasks[BUILDS.sly2ntsc.retail])) {
            return tasks[BUILDS.sly2ntsc.retail][this.id].name;
        } else {
            return this.id;
        }
    }

    get description() {
        if ((BUILD == BUILDS.sly2ntsc) && (this.id in tasks[BUILDS.sly2ntsc.retail])) {
            return tasks[BUILDS.sly2ntsc.retail][this.id].desc;
        } else {
            return `Node at address 0x${this.address}`;
        }
    }

    get type() {
        if ((BUILD == BUILDS.sly2ntsc) && (this.id in tasks[BUILDS.sly2ntsc.retail])) {
            return tasks[BUILDS.sly2ntsc.retail][this.id].type;
        } else {
            return 'Task';
        }
    }

    // generate the style string for the dot node
    get style() {
        /* colors:
            0: red
            1: green
            2: blue
            3: gray */
    
        let label;
        if (nodesDisplay == 'name') {
            label = this.name
        } else if (nodesDisplay == 'id-hex') {
            label = '0x' + hex(this.id);
        } else if (nodesDisplay == 'address') {
            label = '0x' + hex(this.address);
        } else if (nodesDisplay == 'state') {
            label = this.state;
        } else {
            label = this.id;
        }
        let tooltip = this.description.split('"').join('\\"');
        let fillcolor = ['#F77272', '#9EE89B', '#61D6F0', '#C2C2C2'][this.state];
        let color = ['#8A0808', '#207F1D', '#0C687D', '#4E4E4E'][this.state];
        let shape = (this.checkpoint == 0xFFFFFFFF)
            ? (this.type == 'Chalktalk')
                ? 'octagon'
                : 'oval'
            : 'diamond';
        return `[label="${label}" tooltip="${tooltip}" fillcolor="${fillcolor}" ` +
                `color="${color}" shape="${shape}" width=1 height=0.5]`;
    }

    // force the state of the task, maintaining the rules of the dag
    forceState(newState, visited=[]) {
        if (visited.indexOf(this.id) > -1) return; // if already checked, skip

        visited[this.id] = newState; // now we're checking it, so add to visited array

        if (newState < 0 || newState > 3) return; // if attempting to set an invalid value, abort
        if (newState == this.state) return // this state is already target, abort
        if (newState == 2 && this.job == 0) newState = 3; // override setting a node outside a job to 2

        // iterate parents
        for (let parent of this.parents) {
            let p = new Node(parent);

            if (newState == UNAVAILABLE) {
                // if target state is unavailable,
                if (p.state in [UNAVAILABLE, AVAILABLE]) {
                    // if parent state is unvailable or available,
                    // no change to parent is needed
                    p.forceState(p.state, visited);
                } else {
                    // if parent state is complete or final,
                    // parent should be available
                    p.forceState(AVAILABLE, visited);
                }
            } else {
                // if target state is available, complete, or final...
                if (p.job == 0) {
                    // if parent is not in a job, it should be final
                    p.forceState(FINAL, visited);
                } else if (p.job != this.job) {
                    // if parent is in a job, and it's not the same as this nodes' job,
                    // it must be the last node in a job so, it must be final.
                    p.forceState(FINAL, visited);
                } else {
                    // if parent is in a job, and it is the same as this node's job...
                    if (newState == AVAILABLE) {
                        // if target state is available, parent must be complete.
                        p.forceState(COMPLETE, visited)
                    } else {
                        // if the target state is complete or final,
                        // parent must be complete or final, but either way,
                        // it should be the same a this node.
                        p.forceState(newState, visited);
                    }
                }
            }
        }

        // actually update dag state
        this.state = newState;

        // iterate children
        for (let child of this.children) {
            let c = new Node(child);

            if (newState in [UNAVAILABLE, AVAILABLE]) {
                // if target state is unavailable or available,
                // child must be unavailable
                c.forceState(UNAVAILABLE, visited);
            } else if (newState == COMPLETE) {
                // if target state is complete...
                for (let child2 of c.children) {
                    if (child2.state in [AVAILABLE, COMPLETE]) {
                        // if child2 has a child that is available or complete,
                        // child must be complete
                        c.forceState(COMPLETE, visited);
                    } else if (child2.state == UNAVAILABLE) {
                        c.forceState(UNAVAILABLE);
                    } else {
                        // otherwise, it must be available
                        c.forceState(AVAILABLE, visited);
                    }
                }
            } else {
                // if target state is final...
                if (c.job == this.job) {
                    // if child node is in same job as this node,
                    // child must be final
                    c.forceState(FINAL, visited);
                } else {
                    // otherwise, it must be available
                    c.forceState(AVAILABLE, visited);
                }
            }
        }
    }

    // generate the dot language text for the node
    dotNode() {
        let dots = `"${hex(this.address)}" ${this.style}`;
        return dots
    }

    // generate the dot language text for the node's edges
    dotEdges() {
        let dots = [];
        let edges = this.edges;
        for (const e of edges) {
            dots.push(`"${hex(this.address)}" -> "${hex(e)}"`);
        }
        return dots.join('\n');
    }
}

class Graph {
    constructor() {
        this.head;
        this.clusters = {};
        this.edgeText = '';
    }

    clear() {
        this.head = undefined;
        this.clusters = {};
        this.edgeText = '';
    }

    populateGraph(head) {
        this.clear()
        this.head = head;

        var visited  = []

        try {
            this.populateChildren(head, visited)
        } catch (e) {
            console.log("Error populating dag");
        }
    }

    // recursively populate the dag with a node and it's children
    populateChildren(nodeAddress, visited) {
        // add node to visited array so we don't check it twice
        if (visited.indexOf(nodeAddress) > 0) return;
        visited.push(nodeAddress);

        if (visited.length > 500)
            throw new Error("Maximum DAG size exceeded");

        let node = new Node(nodeAddress);

        // add node to cluster in dag based on job
        let job = node.job
        if (!(job in this.clusters)) this.clusters[job] = new Subgraph(job);
        this.clusters[node.job].nodes.push(node);

        // add node edges to task (we only do this once because we assume they won't change)
        this.edgeText += `\t${node.dotEdges()}\n`;

        // recursively add it's children to the graph
        for (const edge of node.edges) {
            if (!(this.edge in visited)) {
                this.populateChildren(edge, visited);
            }
        }
    }

    // reset dag to clean state
    reset() {
        for (let cluster of Object.values(this.clusters)) {
            for (let node of cluster.nodes) {
                if (node.numParents == 0) node.state = 1;
                else node.state = 0;
            }
        }
    }

    // generate the dot language text for the graph
    dot() {
        // init digraph with default styles for graph/node
        let dots = [
            'digraph {',
            'graph [style="bold, rounded" bgcolor="#ffffff00" fontname="courier"]',
            'node [style="filled, bold, rounded" fontname="calibri" fontcolor="black" shape="oval"]',
            'fillcolor="#ffffff00"'
        ];

        // generate dot strings for each cluster and append them to the graph
        for (const [id, cluster] of Object.entries(this.clusters)) {
            if (id == 0) dots.push(cluster.dot(false));
            else dots.push(cluster.dot());
        }

        // append pre-populated edge strings to the graph
        dots.push(`${this.edgeText}}`);

        return dots.join('\n');
    }
}

class Subgraph {
    constructor(id) {
        this.id = id;
        this.nodes = [];
    }

    // generate the dog language text for the subgraph
    dot(cluster=true) {
        let dots = [];

        // nodes that aren't in a job shouldn't have the cluster- prefix
        if (cluster) dots.push(`\tsubgraph cluster${hex(this.id)} {`);
        else dots.push(`\tsubgraph ${hex(this.id)} {`);

        //dots.push(`\tlabel="${hex(this.id)}"\n\tbgcolor="#ffffff40"`);

        for (var node of this.nodes) {
            dots.push('\t\t' + node.dotNode())
        }

        dots.push('\t}\n');
        return dots.join('\n');
    }
}

// Read a value from memory
function readMemory(address, type) {
    return memoryjs.readMemory(processObject.handle, memoryBase + address, type);
}

// Write a value to memory
function writeMemory(address, value, type) {
    return memoryjs.writeMemory(processObject.handle, memoryBase + address, value, type);
}

// Convert a number to a hex string
function hex(num) {
    return num.toString(16);
}

function reattach() {
    try {
        processObject = memoryjs.openProcess('pcsx2.exe');
        //console.log("Connected to PCSX2");
    } catch(err) {
        //console.log("PCSX2 not detected. Make sure PCSX2 is open.");
        processObject = undefined;
        return;
    }
}

function detectGame() {
    if (readMemory(0x92CE0, memoryjs.UINT32) != 1) {
        //console.log("No game detected. Make sure the game is running.");
        BUILD = -1;
        return;
    }

    // detect which game is running and set BUILD
    var sly2Pid = readMemory(0x15b90, memoryjs.STRING);
    var sly3Pid = readMemory(0x15390, memoryjs.STRING);

    if (sly2Pid.indexOf('SCUS_973.16') > -1) { // Sly 2 Retail '73.1'
        GAME = 0;
        BUILD = BUILDS.sly2ntsc;
    } else if (sly3Pid.indexOf('SCUS_974.64') > -1) { // Sly 3 Retail '74.6'
        GAME = 1;
        BUILD = BUILDS.sly3ntsc;
    } else if (sly2Pid.indexOf('SCUS_971.98') > -1) { // Sly 2 March Proto '71.9'
        GAME = 0;
        BUILD = BUILDS.sly2mar;
    } else { // Invalid/Unsupported build
        //console.log("Invalid game detected. Make sure Sly 2 or 3 (NTSC) is running.");
        GAME = BUILD = -1;
    }
}

// Handle events from renderer.js
ipc.on('force-state', function(event, store) {
    let node = new Node(parseInt(store.node, 16));
    node.forceState(store.state);
});

ipc.on('reset-dag', function() {
    dag.reset();
});

ipc.on('refresh-dag', function() {
    dag.populateGraph(dag.head);
});

ipc.on('export-dot', function() {
    let dot = dag.dot();

    fs.writeFile('export.dot', dot, err => {
        if (err) {
          console.error(err)
          return
        }
        console.log("Exported DAG to export.dot");
      })
})

ipc.on('set-settings', function(event, store) {
    autoDetectBuild = store['auto-detect-build'];
    if (!autoDetectBuild) BUILD = BUILDS[store['build']];
    nodesDisplay = store['nodes-display'];
    var baseAddress = store['base-address'];
})

// Create the browser window
function createWindow() {
    // Initialize new window
    const win = new BrowserWindow({
        width: 600,
        height: 800,
        icon: 'img/appicon.png',
        transparent: false,
        frame: false,
        hasShadow: true,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Exit app when window closed
    win.on('closed', function() {
        process.exit();
    })

    // Load the app index.html
    win.loadFile('index.html');

    // Open the dev tools on the main window
    //win.webContents.openDevTools()
    //console.log("DO NOT FORGET TO DISABLE DEV TOOLS BEFORE BUILDING RELEASE VERSION");

    // Return the new BrowserWindow
    return win;
}

// Called after Electron finishes initialization
app.whenReady().then(() => {
    const win = createWindow();

    // Handle minimize and maximize events
    ipc.on('minimize', () => {
        win.minimize();
    })
    ipc.on('maximize', () => {
        win.maximize();
    })

    // Load task names/descriptions from JSON file
    let rawdata = fs.readFileSync('tasks-sly2.json');
    tasks[BUILDS.sly2ntsc.retail] = JSON.parse(rawdata);

    // Init empty Graph
    dag = new Graph();

    // Try to update graph and send dot text to window every 500ms
    setInterval(() => {
        // Try to attach to PCSX2
        reattach();
        if (processObject == undefined) {
            // Handle PCSX2 not detected
            win.webContents.send('no-game', 'PCSX2 not detected.');
        } else {
            // Try to detect currently running game
            if (autoDetectBuild) {
                detectGame();
                win.webContents.send('build', BUILD);
            }

            if (BUILD == -1) {
                // Handle no game detected
                win.webContents.send('no-game', 'Game not detected.');
            } else {
                // Set DAG head node
                var headAddr = [0x3e0b04, 0x478c8c, 0x3EE52C][BUILD];

                // Read World ID from memory
                var worldAddr = [0x3D4A60, 0x468D30, 0x45C398][BUILD]
                var worldId = readMemory(worldAddr, memoryjs.UINT32);

                // Convert Sly 3 world IDs to episode IDs
                if (BUILD == BUILDS.sly3ntsc) {
                    if (worldId == 2) worldId = 'N/A'; // Sly 3 Hazard Room
                    else if (worldId == 1) worldId = 0; // Sly 3 Prologue
                    else worldId -= 2; // all other Sly 3 worlds
                }

                // Get root node of current dag
                if (BUILD == BUILDS.sly2ntsc && worldId == 3) rootNode = readMemory(readMemory(0x3e0b04, memoryjs.UINT32) + 0x20, memoryjs.UINT32); // manually set root for Sly 2 ep3
                else var rootNode = readMemory(headAddr, memoryjs.UINT32); // automatically get it for the rest of them

                // Check and update the dag, only if the root is not null
                if (rootNode != 0x000000) {
                    // Check if the game is loading
                    let isLoading = false;
                    if (BUILD == BUILDS.sly2ntsc && (readMemory(0x3D4830, memoryjs.UINT32) == 0x1)) isLoading = true;
                    else if (BUILD == BUILDS.sly3ntsc && (readMemory(0x467B00, memoryjs.UINT32) == 0x1)) isLoading = true
                    else isLoading = false;

                    // if the dag head is out of date, wait until 0.4 sec after level load to repopulate
                    if ((rootNode != dag.head) && !(isLoading)) {
                        setTimeout(() => {
                            dag.populateGraph(rootNode);
                        }, 400);
                    }

                    // send the dot text to the window
                    win.webContents.send('dot-text', dag.dot());
                    win.webContents.send('world-id', worldId);
                }
            }
        }
    }, 500);
})