// ============================================================
//  help-content.js — Help panel markup
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
// ============================================================

const HELP_HTML = `
<h1>Ash Tree IDE</h1>
<span class="help-tag">LEATR v2 · Ash Edge Language</span>

<h2>What this is</h2>
<p>Ash Tree IDE is a coding environment for the <strong>Ash Edge Language</strong>, compiled by the <strong>LEATR v2</strong> engine. It runs entirely in your browser — nothing is sent to a server. Your files and mind maps are stored locally in this browser.</p>

<h2>The Ash Edge Language</h2>
<p>Ash programs are built from tagged nodes. Each tag pair isolates a layer of the program:</p>
<table>
  <tr><th>Syntax</th><th>Meaning</th></tr>
  <tr><td><code>{{outer}}</code></td><td>Environment tag</td></tr>
  <tr><td><code>[[inner]]</code></td><td>Ownership / script tag</td></tr>
  <tr><td><code>(Node):-: { … }|';'|</code></td><td>A node block — the unit of execution</td></tr>
  <tr><td><code>[poly: …]</code></td><td>Math / data annotation</td></tr>
  <tr><td><code>[net: …]</code></td><td>Network-layer annotation</td></tr>
  <tr><td><code>irin ("…")</code></td><td>Data flowing in</td></tr>
  <tr><td><code>irout ("…")</code></td><td>Data flowing out</td></tr>
  <tr><td><code>with var (x)</code></td><td>Declare a variable</td></tr>
  <tr><td><code>thenplace var (a) with var (b)</code></td><td>Assign / route a value</td></tr>
</table>
<p>A minimal program:</p>
<pre><code>{{env:MyProject}}
[[script:hello-v1]]

(HelloNode):-: {
  with var (s) {
    irin ("Data: Hello, World!")
    Maze
    thenplace var (s) with var (s)
  }
  irout ("Result: " placeto (s))
}|';'|</code></pre>

<h3>Natural Tools</h3>
<p>Seven built-in tools represent the 25 Natural Orders of Operation used by the LEATR framework: <code>Maze</code>, <code>Puzzle</code>, <code>Envelope</code>, <code>Hammer</code>, <code>Stick</code>, <code>Knife</code>, <code>Scissors</code>. Place one inside a node block to invoke it.</p>

<h2>Compiling</h2>
<p>Press <span class="kbd">RUN</span> (or <span class="kbd">Ctrl/Cmd + Enter</span> in the editor) to compile. The compiler:</p>
<ul>
  <li>Lexes the source into tokens</li>
  <li>Parses tokens into node blocks</li>
  <li>Runs the switch equation <code>(xa²√xa) ± 1</code> on every node — encoding on entry, decoding on exit</li>
  <li>Computes a <strong>BRPN</strong> (Buoyancy Reflex Pendulum Node) result: <code>f · r · p</code>, which determines the shell — <strong>Geological</strong>, <strong>Maritime</strong>, or <strong>Aerospace</strong></li>
</ul>
<p>Results appear in the <strong>Output</strong> tab, and a run summary mirrors into the <strong>Terminal</strong>.</p>

<h2>Terminal commands</h2>
<table>
  <tr><td><code>run</code></td><td>Compile the current file</td></tr>
  <tr><td><code>info</code></td><td>Show compiler standard</td></tr>
  <tr><td><code>clear</code></td><td>Clear the terminal and output log</td></tr>
  <tr><td><code>help</code></td><td>List commands</td></tr>
</table>

<h2>Ash Map</h2>
<p>Ash Map is a visual mind-mapping canvas for planning or generating Ash code.</p>
<ul>
  <li><strong>Pan</strong> — drag empty canvas</li>
  <li><strong>Zoom</strong> — pinch, or Ctrl/Cmd + scroll wheel</li>
  <li><strong>Move a node</strong> — drag it</li>
  <li><strong>Reparent a node</strong> — drag it onto another node</li>
  <li><strong>Splice a node into a connection</strong> — drag it onto a curve between two connected nodes</li>
  <li><strong>Edit a node</strong> — double-tap / double-click it</li>
  <li><strong>Connect via sockets</strong> — every linked node shows small dots on its left (in) and right (out) edges; drag from a socket to another node to link them, or drag a socket off onto empty canvas to disconnect that side</li>
  <li><strong>Disconnect tool</strong> — the target-shaped tool in the rail switches the canvas into disconnect mode: click any curve to remove just that connection</li>
  <li><strong>Undo / redo</strong> — full multi-step history per document, saved locally</li>
</ul>
<p>Node types include plain text nodes and ASH-aware nodes — <strong>ASH Code</strong>, <strong>Terminal Output</strong>, <strong>2D Output</strong>, <strong>3D Output</strong>, <strong>Input Form</strong>, and <strong>Output Form</strong> — which the <strong>Generate ASH code</strong> action (the lightning-bolt tool) turns into real Ash source, loaded straight into the editor.</p>

<h2>Files</h2>
<p>New files, uploads, and downloads all work locally. Use the download icon in the editor toolbar to save a <code>.ash</code> file to your device, or the upload icon to open one.</p>

<h2>About</h2>
<p>Ash Tree IDE and the LEATR framework are built by DART Meadow / Radical Deepscale LLC. This web build mirrors the native iOS app at <code>ide.leatr.xyz</code>.</p>
`;
