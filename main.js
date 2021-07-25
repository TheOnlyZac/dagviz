'use strict'

// Set up packages
const { app, BrowserWindow, webContents } = require('electron');
const ipcRenderer = require('electron').ipcRenderer;
const path = require('path');

// Set up memoryjs
const memoryjs = require("memoryjs");
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
        // init graph with basic styles
        let dotString = [
            'digraph {',
            'graph [style="bold, rounded" bgcolor="#ffffff00" fontname="courier"]',
            'node [style="filled, bold, rounded" fontname="courier" fontcolor="black" shape="oval"]',
            'fillcolor="#ffffff00"'
        ].join('\n');

        // generate dot strings for each cluster and append them to the graph
        for (const [id, cluster] of Object.entries(this.clusters)) {
            if (id == 0) dotString += cluster.dot(false)
            else dotString += cluster.dot();
        }

        // append edge strings to the graph and return the dot text
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

        if (cluster) dotString += `\tsubgraph cluster${hex(this.id)} {\n`;
        else dotString += `\tsubgraph ${hex(this.id)} {\n`;

        dotString += `\tlabel="${hex(this.id)}"\n\tbgcolor="#ffffff40"\n`

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
        width: 600,
        height: 800,
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
    win.webContents.openDevTools()

    // Return the new BrowserWindow
    return win;
}

// Called after Electron finishes initialization
app.whenReady().then(() => {
    const win = createWindow();

    try {
        // head node is pointed to by 0x826e80
        let head = readMemory(0x3e0b04, memoryjs.UINT32);
        let dag = new Graph(head);

        // sent dot text to window every second
        setInterval(() => {
            if (processObject == null) return;

            let currHead = readMemory(0x3e0b04, memoryjs.UINT32);

            // make sure dag isn't null before doing anything
            if (currHead != 0x000000) {
                // update the dag head and repopulate with nodes only if game isn't loading
                let isLoading = (readMemory(0x003D4830, memoryjs.UINT32) == 0x1) ? true : false;
                if ((currHead != dag.head) && !(isLoading)) {
                    dag.head = currHead;
                    dag.populateGraph();
                }
                
                // send the dot text to the window
                win.webContents.send('dot-text', dag.dot());
            }
        }, 1000);
    } catch (err) {
        console.log(`An error occurred. Please contact TheOnlyZac#0269 on Discord.\nError details:\n${err}`);
        process.exit(1);
    }
})