'use strict'

// Import packages
const { app, BrowserWindow, webContents } = require('electron');
const ipc = require('electron').ipcMain;
const path = require('path');
const memoryjs = require('memoryjs');
const fs = require('fs');

// Set up memoryjs
const processName = 'pcsx2.exe';

// Try to open pcsx2 process
let processObject;
try {
    processObject = memoryjs.openProcess(processName);
} catch(err) {
    console.log("PCSX2 not detected. Please make sure PCSX2 is open and Sly 2 or 3 (NTSC) is running.");
    process.exit(1);
}
const memoryBase = 0x20000000

// Possible task states
const UNAVAILABLE = 0;
const AVAILABLE = 1;
const COMPLETE = 2;
const FINAL = 3;

// Game ID:
// 0 = Sly 2 Proto
// 1 = Sly 2
// 2 = Sly 3
let GAME = 0;

// Declare DAG and tasks dict
let dag;
let tasks = {};

// Define graph classes
class Node {

    static oId = [0x0, 0x18, 0x18];
    static oState = [0x0, 0x54, 0x44];
    static oNumChildren = [0x0, 0xa0, 0x90];
    static oChildrenArray = [0x0, 0xa4, 0x94];
    static oNumParents = [0x0, 0x94, 0x84];
    static oParentsArray = [0x0, 0x98, 0x88];
    static oJob = [0x0, 0x7c, 0x6c];
    static oCheckpoint = [0x0, 0xb8, 0xa8];

    constructor(address) {
        this.address = address;

        // we only populate the edges array once bc we assume it won't change
        this.edges = this.children;
    }

    get id() {
        return readMemory(this.address + Node.oId[GAME], memoryjs.UINT32);
    }

    get name() {
        if ((GAME in tasks) && (this.id in tasks[GAME])) {
            return tasks[GAME][this.id].name;
        } else {
            return this.id;
        }
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

    // generate the style string for the dot node
    get style() {
        /* colors:
            0: red
            1: green
            2: blue
            3: gray
        */
        let label = this.name;
        let fillcolor = ['#F77272', '#9EE89B', '#61D6F0', '#C2C2C2'][this.state];
        let color = ['#8A0808', '#207F1D', '#0C687D', '#4E4E4E'][this.state];
        let shape = (this.checkpoint == 0xFFFFFFFF) ? 'oval' : 'diamond';
        return `[label="${label}" fillcolor="${fillcolor}" color="${color}" shape="${shape}" width=2 height=0.75]`;
    }
    
    // force the state of the task, maintaining the rules of the dag
    forceState(target, visited=[], skipParents=false) {
        if (visited.indexOf(this.address) > -1) return; // if already checked, skip
        visited.push(this.address); // now we're checking it, so add to visited array

        if (target < 0 || target > 3) return; // if attempting to set an invalid value, abort
        if (target == this.state) return // this state is already target, abort
        if (target == 2 && this.job == 0) target = 3; // override setting a node outside a job to 2

        // iterate parents
        for (let parent of this.parents) {
            let p = new Node(parent);

            if (target == UNAVAILABLE) {
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
                    if (target == AVAILABLE) {
                        // if target state is available, parent must be complete.
                        p.forceState(COMPLETE, visited)
                    } else {
                        // if the target state is complete or final,
                        // parent must be complete or final, but either way,
                        // it should be the same a this node.
                        p.forceState(target, visited);
                    }
                }
            }
        }

        // actually update dag state
        this.state = target;

        // iterate children
        for (let child of this.children) {
            let c = new Node(child);

            if (target in [UNAVAILABLE, AVAILABLE]) {
                // if target state is unavailable or available,
                // child must be unavailable
                c.forceState(UNAVAILABLE, visited);
            } else if (target == COMPLETE) {
                // if target state is complete,
                // child must be available
                c.forceState(AVAILABLE, visited);
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
    constructor(head) {
        this.head = head;
        this.clusters = {};
        this.edgeText = '';
        
        this.populateGraph();
    }

    populateGraph() { 
        this.clusters = {};
        this.edgeText = '';

        var visited  = []
        this.populateChildren(this.head, visited)
    }

    // recursively populate the dag with a node and it's children
    populateChildren(nodeAddress, visited) {
        // add node to visited array so we don't check it twice
        if (visited.indexOf(nodeAddress) > 0) return;
        visited.push(nodeAddress);

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
                if (node.address == this.head) node.state = 1;
                else node.state = 0;
            }
        }
    }

    // generate the dot language text for the graph
    dot() {
        // init digraph with default styles for graph/node
        let dots = [
            'digraph {',
            'graph [style="bold, rounded" bgcolor="#ffffffff" fontname="courier"]',
            'node [style="filled, bold, rounded" fontname="courier" fontcolor="black" shape="oval"]',
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

        dots.push(`\tlabel="${hex(this.id)}"\n\tbgcolor="#ffffff40"`);

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

function setGame() {
    // detect which game is running and set GAME
    let sly2 = readMemory(0x15b90, memoryjs.STRING);
    let sly3 = readMemory(0x15390, memoryjs.STRING);
    if (sly2.indexOf('SCUS_973.16') > -1) GAME = 1;
    else if (sly3.indexOf('SCUS_974.64') > -1) GAME = 2;
    else process.exit(1);
}

// Handle event from renderer
ipc.on('increment-state', function(event, store) {
    let node = new Node(parseInt(store, 16));
    node.forceState((node.state + 1) % 4);
});

ipc.on('force-state', function(event, store) {
    let node = new Node(parseInt(store.node, 16));
    node.forceState(store.state);
});

ipc.on('reset-dag', function() {
    dag.reset();
});

ipc.on('refresh-dag', function() {
    dag.populateGraph();
});

ipc.on('export-dot', function() {
    let dot = dag.dot();

    fs.writeFile('export.dot', dot, err => {
        if (err) {
          console.error(err)
          return
        }
        // file written successfully
      })
})

// Create the browser window
function createWindow() {
    // Initialize new window
    const win = new BrowserWindow({
        width: 600,
        height: 800,
        //transparent: true,
        //frame: false,
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
    //console.log("DO NOT FORGOT TO DISABLE DEV TOOLS BEFORE BUILDING RELEASE VERSION");

    // Return the new BrowserWindow
    return win;
}

// Called after Electron finishes initialization
app.whenReady().then(() => {
    const win = createWindow();

    // Update and set game ID
    setGame();
    
    let rawdata = fs.readFileSync('tasks-sly2.json');
    tasks[1] = JSON.parse(rawdata);

    // note: head node is pointed to by 0x003EE52C (proto), 0x826e80 (Sly 2), 0xsomething (Sly 3)
    let headAddr = [0x3EE52C, 0x3e0b04, 0x478c8c][GAME];
    let head = readMemory(headAddr, memoryjs.UINT32);
    
    dag = new Graph(head);

    // sent dot text to window every 500ms
    setInterval(() => {
        setGame();

        let worldAddr = [0x0, 0x3D4A60, 0x468D30][GAME]
        let worldId = readMemory(worldAddr, memoryjs.UINT32);

        if (GAME == 2) {
            if (worldId == 2) worldId = 'N/A';
            else if (worldId > 2) worldId -= 2;
        }        

        let currHead;
        if (GAME == 1 && worldId == 3) currHead = readMemory(readMemory(0x3e0b04, memoryjs.UINT32) + 0x20, memoryjs.UINT32); // manually set head for Sly 2 ep3
        else currHead = readMemory(headAddr, memoryjs.UINT32);

        // make sure dag isn't null before doing anything
        if (currHead != 0x000000) {
            // if the dag head is wrong, wait until 1 sec after level load to repopulate
            let isLoading = false;
            if (GAME == 1 && (readMemory(0x3D4830, memoryjs.UINT32) == 0x1)) isLoading = true;
            else if (GAME == 2 && (readMemory(0x467B00, memoryjs.UINT32) == 0x1)) isLoading = true;

            if ((currHead != dag.head) && !(isLoading)) {
                setTimeout(() => {
                    dag.head = currHead;
                    dag.populateGraph();
                }, 1000);
            }
            
            // send the dot text to the window
            win.webContents.send('dot-text', dag.dot());
            win.webContents.send('world-id', worldId);
        }
    }, 500);
})