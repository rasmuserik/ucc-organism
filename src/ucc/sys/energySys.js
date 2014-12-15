var R = require('ramda');
var random = require('pex-random');
var graph  = require('../../graph');
var Color = require('pex-color').Color;
var Spline3D = require('pex-geom').Spline3D;
var Vec3 = require('pex-geom').Vec3;
var LineBuilder = require('pex-gen').LineBuilder;
var Mesh = require('pex-glu').Mesh;
var SolidColor = require('pex-materials').SolidColor;
var ShowNormals = require('pex-materials').ShowNormals;
var config            = require('../../config');

function removeEnergyPathsEntities(state) {
  //remove existing map meshes
  state.entities.filter(R.where({ energy: true })).forEach(function(entity) {
    if (entity.mesh) {
      entity.mesh.material.program.dispose();
      entity.mesh.dispose();
    }
    state.entities.splice(state.entities.indexOf(entity), 1);
  });
}

function rebuildEnergyPaths(state) {
  removeEnergyPathsEntities(state);

  var selectedNodes = state.map.selectedNodes;

  var numPaths = 50;
  R.range(0, numPaths).map(function() {
    var start = random.element(selectedNodes);
    var end = random.element(selectedNodes);
    var path = graph.findShortestPath(start, end);
    if (!path || path.length == 0) return;
    var pathPoints = R.pluck('position')(path);
    var spline = new Spline3D(pathPoints);
    var g = new LineBuilder();
    g.addPath(spline, Color.Red, 0);
    //var mesh = new Mesh(g, new SolidColor({ color: Color.Red }), { lines: true });
    //state.entities.push({ name: 'energyPathMesh', energy: true, debug: false, mesh: mesh, lineWidth: 5 });
    var energyType = config.energyTypes[random.element(Object.keys(config.energyTypes))];
    state.entities.push({ energyPath: spline, energy: true, color: energyType.color });
  })
}

function update(state) {
  if (!state.map.nodes.length) {
    return;
  }

  if (state.map.dirty) {
    rebuildEnergyPaths(state);
  }
}

module.exports = update;