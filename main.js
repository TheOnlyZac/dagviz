'use strict'

// Set up packages
const { app, BrowserWindow, webContents } = require('electron');
const ipcRenderer = require('electron').ipcRenderer;
const path = require('path');

const memoryjs = require("memoryjs");
const processName = 'pcsx2.exe';
const processObject = memoryjs.openProcess(processName);
const memoryBase = 0x20000000

// Define graph classes
class Node {
    constructor(address) {
        this.address = address;
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
        return readMemory(this.address + 0x7c, memoryjs.UINT32);
    }
    
    // get an array of nodes pointed to by this node
    get edges() {
        //console.log("edges>")
        let edges = [];
        //console.log(`this.address: ${this.address}`);
        let numEdges = readMemory(this.address + 0xa0, memoryjs.UINT32);
        let edgeArray = readMemory(this.address + 0xa4, memoryjs.UINT32);
        //console.log(`numEdges: ${numEdges} | hex(edgeArray): ${hex(edgeArray)}`)
        for (let i = 0; i < numEdges; i++) {
            edges.push(readMemory(edgeArray + i*4, memoryjs.UINT32));
        }
        //console.log(`edges result: ${edges}`);
        //console.log("<edges")
        return edges;
    }

    // get the checkpoint for this node
    get checkpoint() {
        return readMemory(this.address + 0xb8, memoryjs.UINT32);
    }

    // generate the style string for the dot node
    get style() {
        let color = ['#FF0000', '#1E92FF', '#00FF00', '#B8B8B8'][this.state];
        let shape = (this.checkpoint == 0xFFFFFFFF) ? 'oval' : 'diamond';
        return `[style="filled" fillcolor="${color}" shape="${shape}"]`;
    }

    // generate the dot language text for the node
    dotNode() {
        let dotString = `"${hex(this.address)}" ${this.style}`
        return dotString
    }

    dotEdges() {
        let dotString = ""
        let edges = this.edges;
        for (const e of edges) {
            dotString += `"${hex(this.address)}" -> "${hex(e)}"`
        }
        return dotString;
    }
}

class Graph {
    constructor() {
        this.lastHead = this.head;
        this.clusters = {};
        this.edgeText = '';
        this.populateGraph();
    }

    // get the head of the dag from game memory
    get head() {
        // head node is pointed to by 0x826e80
        return readMemory(0x3e0b04, memoryjs.UINT32);
    }

    populateGraph() { 
        this.clusters = {};
        this.edgeText = '';   
        var visited  = []
        this.populateChildren(this.head, visited)
    }

    // recursively populate the dag with a node and it's children
    populateChildren(nodeAddress, visited) {
        //console.log('populateChildren>');
        if (visited.indexOf(nodeAddress) > 0) return;

        visited.push(nodeAddress);
        let node = new Node(nodeAddress);

        // add node to cluster in dag based on job
        let job = node.job
        if (!(job in this.clusters)) this.clusters[job] = new Subgraph(job);
        this.clusters[node.job].nodes.push(node);
        
        // add node edges to graph
        this.edgeText += `\t${node.dotEdges()}\n`;

        // recursively add it's children to the dag
        for (const edge of node.edges) {
            //console.log(`node.edges: ${node.edges}`);
            //console.log(`checking to see if edge ${edge} is in the dag`)
            if (!(this.edge in visited)) {
                this.populateChildren(edge, visited);
            }
        }
        //console.log('<populateChildren');
    }

    // generate the dog language text for the graph
    dot() {
        if (this.head != this.lastHead) this.populateGraph();
        let dotString = 'digraph {\ngraph [bgcolor="#ffffff00"]\n';

        // populate each cluster with node strings
        for (const [id, cluster] of Object.entries(this.clusters)) {
            if (id == 0) dotString += cluster.dot(false)
            else dotString += cluster.dot();
        }

        dotString += `${this.edgeText}\n}`;
        return dotString;
    }
}

class Subgraph {
    constructor(id) {
        this.id = id;
        this.nodes = [];
    }

    // generate the dog language text for the graph
    dot(cluster=true) {
        let dotString = '';

        if (cluster) dotString += `\tsubgraph cluster${this.id} {\n`;
        else dotString += `\tsubgraph ${this.id} {\n`;

        for (var node of this.nodes) {
            dotString += '\t\t' + node.dotNode() + '\n'
        }

        dotString += '\t}\n';
        return dotString;
    }
}

// Helper functions for reading/writing memory values
function readMemory(address, type) {
    return memoryjs.readMemory(processObject.handle, memoryBase + address, type);
}

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
        width: 500,
        height: 700,
        transparent: true,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Load the app index.html
    win.loadFile('index.html');
    
    // Open the dev tools on the main window
    //win.webContents.openDevTools()

    // Return the new BrowserWindow
    return win;
}

// Called after Electron finishes initialization
app.whenReady().then(() => {
    const win = createWindow();
    
    let dag = new Graph();
    setInterval(() => {
        win.webContents.send('dot-text', dag.dot());
    }, 1000);
})