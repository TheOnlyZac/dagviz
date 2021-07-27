'use strict'

// Import packages
const { app, BrowserWindow, webContents } = require('electron');
const ipc = require('electron').ipcMain;
const path = require('path');
const memoryjs = require("memoryjs");

// Set up memoryjs
const processName = 'pcsx2.exe';

// Try to open pcsx2 process
let processObject;
try {
    processObject = memoryjs.openProcess(processName);
} catch(err) {
    console.log("PCSX2 not detected. Please make sure PCSX2 is open and Sly 2 NTSC is running.");
    process.exit(1);
}
const memoryBase = 0x20000000

const UNAVAILABLE = 0;
const AVAILABLE = 1;
const COMPLETE = 2;
const FINAL = 3;

let dag;

// Define graph classes
class Node {
    constructor(address) {
        this.address = address;

        // we only populated the edges array once bc we assume it won't change
        this.edges = this.children;
    }

    // get the current state of the task (0, 1, 2, 3)
    get state() {
        return readMemory(this.address + 0x54, memoryjs.UINT32);
    }
    s
    
    set state(val) {
        writeMemory(this.address + 0x54, val, memoryjs.UINT32);
    }

    get children() {
        let children = []
        let numChildren = readMemory(this.address + 0xa0, memoryjs.UINT32);
        let childrenArray = readMemory(this.address + 0xa4, memoryjs.UINT32); // retail: a4, proto: 98
        for (let i = 0; i < numChildren; i++) {
            children.push(readMemory(childrenArray + i*4, memoryjs.UINT32));
        }
        return children;
    }

    get parents() {
        let parents = []
        let numParents = readMemory(this.address + 0x94, memoryjs.UINT32);
        let parentsArray = readMemory(this.address + 0x98, memoryjs.UINT32); // retail: a4, proto: 98
        for (let i = 0; i < numParents; i++) {
            parents.push(readMemory(parentsArray + i*4, memoryjs.UINT32));
        }
        return parents;
    }

    // get the job pointer for the task
    get job() {
        return readMemory(this.address + 0x7c, memoryjs.UINT32); //retail
        //return readMemory(this.address + 0x74, memoryjs.UINT32); //proto
    }

    // get the checkpoint for this node
    get checkpoint() {
        return readMemory(this.address + 0xb8, memoryjs.UINT32);
    }

    // generate the style string for the dot node
    get style() {
        /* colors:
            0: red
            1: green
            2: blue
            3: gray
        */
        let fillcolor = ['#F77272', '#9EE89B', '#61D6F0', '#C2C2C2'][this.state];
        let color = ['#8A0808', '#207F1D', '#0C687D', '#4E4E4E'][this.state];
        let shape = (this.checkpoint == 0xFFFFFFFF) ? 'oval' : 'diamond';
        return `[fillcolor="${fillcolor}" color="${color}" shape="${shape}"]`;
    }
    
    // force the state of the task, maintaining the rules of the dag
    forceState(target, visited=[], skipParents=false) {
        //if (visited.length == 0) console.log("\nWarning: No visited array passed");
        if (visited.indexOf(this.address) > -1) return; // if already checked, skip
        visited.push(this.address); // now we're checking it, so add to visited array

        //console.log(`${hex(this.address)}, ${target}`);
        if (target < 0 || target > 3) return; // if attempting to set an invalid value, abort
        if (target == this.state) return // this state is already target, abort
        if (target == 2 && this.job == 0) target = 3; // override setting a node outside a job to 2

        // iterate parents
        for (let parent of this.parents) {
            let p = new Node(parent);

            if (target == UNAVAILABLE) {
                // if target state is unavailable,
                // parent should be unavailable
                p.forceState(UNAVAILABLE, visited);
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
            'graph [style="bold, rounded" bgcolor="#ffffff00" fontname="courier"]',
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
    win.webContents.openDevTools()

    // Return the new BrowserWindow
    return win;
}

// Called after Electron finishes initialization
app.whenReady().then(() => {
    const win = createWindow();

    try {
        // note: head node is pointed to by 0x826e80
        let head = readMemory(0x3e0b04, memoryjs.UINT32); //retail
        //let head = readMemory(0x003EE52C, memoryjs.UINT32); //proto
        
        dag = new Graph(head);
        //console.log(dag.dot());

        // sent dot text to window every 500ms
        setInterval(() => {
            // if not attached to pcsx2 process, exit
            if (processObject == null) process.exit(0);

            let worldId = readMemory(0x3D4A60, memoryjs.UINT32);

            let currHead;
            if (worldId == 3) currHead = 0x0070DC40; // manually set head for w3
            else currHead = readMemory(0x3e0b04, memoryjs.UINT32); //retail
            //let currHead = readMemory(0x003EE52C, memoryjs.UINT32); //proto

            // make sure dag isn't null before doing anything
            if (currHead != 0x000000) {
                // if the dag head is wrong, wait until 1 sec after level load to repopulate
                let isLoading = (readMemory(0x003D4830, memoryjs.UINT32) == 0x1) ? true : false;
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
    } catch (err) {
        console.log(`An error occurred. Please contact TheOnlyZac#0269 on Discord.\nError details:\n${err}`);
        process.exit(1);
    }
})