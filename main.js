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
        // todo
        return
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
        let dotString = `"${hex(this.address)}" ${this.style}\n`
        return dotString
    }

    dotEdges() {
        let dotString = ""
        let edges = this.edges;
        for (const e of edges) {
            dotString += `"${hex(this.address)}" -> "${hex(e)}"\n`
        }
        return dotString;
    }
}

class DAG {
    constructor() {
        this.nodes = {};
        this.refresh();
    }

    // get the head of the dag from game memory
    get head() {
        // head node is pointed to by 0x826e80
        return readMemory(0x3e0b04, memoryjs.UINT32);
    }

    // clear and regenerate the dag
    refresh() {
        this.nodes = {};
        this.populateChildren(this.head)
    }

    // recursively populate the dag with a node and it's children
    populateChildren(nodeAddress) {
        //console.log('populateChildren>');
        let node = new Node(nodeAddress);

        // add node to dag
        this.nodes[nodeAddress] = node;

        // recursively add it's children to the dag
        for (const edge of node.edges) {
            //console.log(`node.edges: ${node.edges}`);
            //console.log(`checking to see if edge ${edge} is in the dag`)
            if (!(this.edge in this.nodes)) {
                this.populateChildren(edge);
            }
        }
        //console.log('<populateChildren');
    }

    // generate the dog language text for the graph
    dot() {
        let clusters = {};

        let dotString = 'digraph {\n';

        // group all nodes in dag by cluster
        for (let [id, node] of Object.entries(this.nodes)) {
            if (!(node.job in clusters)) clusters[node.job] = [];
            // add node to cluster
            clusters[node.job].push(node);
            // add node edges to graph
            dotString += node.dotEdges();
        }

        // populate each cluster with node strings
        for (const [id, cluster] of Object.entries(clusters)) {
            let clusterString = "";

            if (id != 0) clusterString += `subgraph cluster${id} {\n`;
            for (let node of cluster) {
                clusterString += node.dotNode();
            }
            if (id != 0) clusterString += '}\n';

            dotString += clusterString;
        }

        dotString += '}';
        return dotString;
    }
}

// Helper function for reading memory values
function readMemory(address, type) {
    return memoryjs.readMemory(processObject.handle, memoryBase + address, type);
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
    win = createWindow();
    
    let dag = new DAG();
    console.log(dag.dot());
    setInterval(() => {
        win.webContents.send('dot-text', dag.dot());
    }, 1000);
})