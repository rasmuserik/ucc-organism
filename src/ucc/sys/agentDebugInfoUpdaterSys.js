var geom          = require('pex-geom');
var glu           = require('pex-glu');
var gen           = require('pex-gen');
var materials     = require('pex-materials');
var random        = require('pex-random');
var color         = require('pex-color');
var R             = require('ramda');

var Vec3          = geom.Vec3;
var Mesh          = glu.Mesh;
var LineBuilder   = gen.LineBuilder;
var ShowColors    = require('../../materials/ShowColors');
var Color         = color.Color;

function agentDebugInfoUpdaterSys(state) {
  if (!state.agentDebugInfoMeshEntity) {
    var lineBuilder = new LineBuilder();
    lineBuilder.addLine(new Vec3(0, 0, 0), random.vec3());
    var mesh = new Mesh(lineBuilder, new ShowColors(), { lines: true });
    state.agentDebugInfoMeshEntity = {
      disableDepthTest: true,
      agentTarget: true,
      mesh: mesh
    };
    state.entities.push(state.agentDebugInfoMeshEntity);
  }

  var lineBuilder = state.agentDebugInfoMeshEntity.mesh.geometry;
  lineBuilder.reset();

  if (state.showLabels) {
    var agents = R.filter(R.where({ agent: R.identity }), state.entities);
    agents.forEach(function(agent) {
      state.debugText.drawText(agent.type + '/' + agent.state.mode, agent.position);
    });
  }

  if (state.showAgentTargets) {
    var agents = R.filter(R.where({ agent: R.identity }), state.entities);
    agents.forEach(function(agent) {
      //if (agent.targetNode) {
      //  lineBuilder.addLine(agent.position, agent.targetNode.position, Color.Green);
      //}
      if (agent.targetNodeList && agent.targetNodeList.length > 0) {
        lineBuilder.addLine(agent.position, agent.targetNodeList[agent.targetNodeList.length-1].position, Color.Pink);
      }
      //  for(var i=0; i<agent.targetNodeList.length-1; i++) {
      //    var p = agent.targetNodeList[i].position;
      //    var np = agent.targetNodeList[i+1].position;
      //    lineBuilder.addCross(p, 0.01, Color.Orange);
      //    lineBuilder.addCross(p.dup().lerp(np, 0.25), 0.01, Color.Orange);
      //    lineBuilder.addCross(p.dup().lerp(np, 0.50), 0.01, Color.Orange);
      //    lineBuilder.addCross(p.dup().lerp(np, 0.75), 0.01, Color.Orange);
      //  }
    })
  }
}

module.exports = agentDebugInfoUpdaterSys;