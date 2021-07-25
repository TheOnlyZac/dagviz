'use strict'
// note to future self
// I have modified it to work with the proto, any lines with comment //retail
// are for retail, and any linkes with comment //proto are the proto. Swap them
// to make it work normally again 7/25/21

// Import packages
const { app, BrowserWindow, webContents } = require('electron');
const ipcRenderer = require('electron').ipcRenderer;
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

// Define graph classes
class Node {
    constructor(address) {
        this.address = address;

        // we only populated the edges array once bc we assume it won't change
        this.edges = [];
        let numEdges = readMemory(this.address + 0xa0, memoryjs.UINT32); // retail: a0, proto: 94
        let edgeArray = readMemory(this.address + 0xa4, memoryjs.UINT32); // retail: a4, proto: 98
        for (let i = 0; i < numEdges; i++) {
            this.edges.push(readMemory(edgeArray + i*4, memoryjs.UINT32));
        }
    }

    // get/set the current state of the task (0, 1, 2, 3)
    get state() {
        return readMemory(this.address + 0x54, memoryjs.UINT32);
    }
    set state(val) {
        writeMemory(this.address + 0x54, val, memoryjs.UINT32);
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
            1: blue
            2: green
            3: gray
        */
        let fillcolor = ['#F77272', '#61D6F0', '#9EE89B', '#C2C2C2'][this.state];
        let color = ['#8A0808', '#0C687D', '#207F1D', '#4E4E4E'][this.state];
        let shape = (this.checkpoint == 0xFFFFFFFF) ? 'oval' : 'diamond';
        return `[fillcolor="${fillcolor}" color="${color}" shape="${shape}"]`;
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
        
        let dag = new Graph(head);
        //console.log(dag.dot());

        // sent dot text to window every 500ms
        setInterval(() => {
            // if not attached to pcsx2 process, exit
            if (processObject == null) process.exit(0);

            let currHead = readMemory(0x3e0b04, memoryjs.UINT32); //retail
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
            }
        }, 500);
    } catch (err) {
        console.log(`An error occurred. Please contact TheOnlyZac#0269 on Discord.\nError details:\n${err}`);
        process.exit(1);
    }
})