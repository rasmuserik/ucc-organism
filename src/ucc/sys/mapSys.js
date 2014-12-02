var R                 = require('ramda');
var geom              = require('pex-geom');
var glu               = require('pex-glu');
var materials         = require('pex-materials');
var color             = require('pex-color');
var gen               = require('pex-gen');
var random            = require('pex-random');

var delaunay          = require('../../geom/delaunay');
var voronoi           = require('../../geom/voronoi');
var graph             = require('../../graph');
var fn                = require('../../utils/fn');
var GeomUtils         = require('../../geom/GeomUtils');
var Rect              = require('../../geom/Rect');

var BoundingBoxHelper = require('../../helpers/BoundingBoxHelper');
var config            = require('../../config');

var Geometry          = geom.Geometry;
var BoundingBox       = geom.BoundingBox;
var Vec2              = geom.Vec2;
var Vec3              = geom.Vec3;
var Mesh              = glu.Mesh;
var SolidColor        = materials.SolidColor;
var ShowColors        = materials.ShowColors;
var Color             = color.Color;
var LineBuilder       = gen.LineBuilder;

var EPSILON = 0.001;

//-----------------------------------------------------------------------------

var MapSys = {
  ready: false
};

//-----------------------------------------------------------------------------

function vec3to2(v) {
  return new Vec2(v.x, v.y);
}

//-----------------------------------------------------------------------------

function vec2to3(v) {
  return new Vec3(v.x, v.y, 0);
}

//-----------------------------------------------------------------------------

Vec3.prototype.setLength = function(len) {
  this.normalize().scale(len);
  return this;
}

//-----------------------------------------------------------------------------

function PointSet3() {
  this.points = [];
}

PointSet3.prototype.add = function(v) {
  for(var i=0; i<this.points.length; i++) {
    var p = this.points[i];
    if (p.distance(v) < EPSILON) return p;
  }
  this.points.push(v);
  return v;
}

//-----------------------------------------------------------------------------

function pointsToMesh(points, color) {
  color = color || Color.White;
  var lineBuilder = new LineBuilder();
  points.forEach(function(p) {
    lineBuilder.addCross(p, 0.003);
  })
  var mesh = new Mesh(lineBuilder, new SolidColor({ color : color }), { lines: true })
  return mesh;
}

//-----------------------------------------------------------------------------

function removeMapEntities(state) {
  //remove existing map meshes
  state.entities.filter(R.where({ map: true})).forEach(function(entity) {
    entity.mesh.material.program.dispose();
    entity.mesh.dispose();
    state.entities.splice(state.entities.indexOf(entity), 1);
  });
}

//-----------------------------------------------------------------------------

function centerCamera(state, floorBBox) {
  var target = floorBBox.getCenter();
  var position = new Vec3(state.camera.target.x, state.camera.target.y + 0.001, state.camera.target.z  + state.cameraPosZ);
  state.camera.setUp(new Vec3(0, 0, -1));
  state.arcball.setPosition(position);
  state.arcball.setTarget(target);
}

//-----------------------------------------------------------------------------

function rebuildMap(state) {
  removeMapEntities(state);
  rebuildCells(state);

  var selectedNodes = state.map.selectedNodes;
  var corridorNodes = selectedNodes.filter(R.where({ room: R.not(R.identity) }));
  var entranceNodes = selectedNodes.filter(R.pipe(R.prop('neighbors'), R.prop('length'), R.rPartial(R.eq, 1)));
  var stairsNodes = selectedNodes.filter(function(node) {
    return !node.neighbors.reduce(function(sameFloorSoFar, neighborNode) {
      return sameFloorSoFar && (neighborNode.floor == node.floor);
    }, true)
  });

  var pointVertices = selectedNodes.map(R.prop('position'));
  var roomVertices = selectedNodes.filter(R.where({ room: R.identity }));
  var entrancePointVertices = entranceNodes.map(R.prop('position'));
  var stairsPointVertices = stairsNodes.map(R.prop('position'));

  var roomEdgeVertices = R.flatten(roomVertices.map(function(node) {
    return node.neighbors.filter(R.where({ room: R.identity })).map(function(neighborNode) {
      return [ node.position, neighborNode.position ];
    })
  }));

  var corridorEdgeVertices = R.flatten(corridorNodes.map(function(node) {
    return node.neighbors.map(function(neighborNode) {
      return [ node.position, neighborNode.position ];
    })
  }));

  var mapPointsGeometry = new Geometry({ vertices: pointVertices });
  var mapPointsMesh = new Mesh(mapPointsGeometry, new SolidColor({ pointSize: 5, color: Color.Red }), { points: true });

  var entrancePointsGeometry = new Geometry({ vertices: entrancePointVertices });
  var entrancePointsMesh = new Mesh(entrancePointsGeometry, new SolidColor({ pointSize: 10, color: Color.Yellow }), { points: true });

  var stairsPointsGeometry = new Geometry({ vertices: stairsPointVertices });
  var stairsPointsMesh = new Mesh(stairsPointsGeometry, new SolidColor({ pointSize: 10, color: Color.Orange }), { points: true });

  var corridorEdgesGeometry = new Geometry({ vertices: corridorEdgeVertices });
  var corridorEdgesMesh = new Mesh(corridorEdgesGeometry, new SolidColor({ pointSize: 2, color: Color.DarkGrey }), { lines: true });

  var floorBBox = BoundingBox.fromPoints(pointVertices);
  var floorBBoxHelper = new BoundingBoxHelper(floorBBox, Color.Yellow);

  var roomVertexGroups = fn.groupBy(roomVertices, 'room');

  Object.keys(roomVertexGroups).forEach(function(roomId) {
    var roomVertices = roomVertexGroups[roomId];

    var roomEdges = R.flatten(roomVertices.map(function(node) {
      return node.neighbors.filter(R.where({ room: R.identity })).map(function(neighborNode) {
        return [ node.position, neighborNode.position ];
      })
    }));
    var g = new Geometry({ vertices: roomEdges });
    var m = new Mesh(g, new SolidColor({ pointSize: 2, color: Color.Cyan }), { lines: true });
    state.entities.push({ map: true, debug: true, room: roomId, mesh: m });
  })

  //add new entities
  //state.entities.push({ map: true, debug: true, mesh: mapPointsMesh });
  //state.entities.push({ map: true, debug: true, mesh: entrancePointsMesh });
  state.entities.push({ map: true, debug: true, mesh: stairsPointsMesh });
  state.entities.push({ map: true, debug: true, mesh: corridorEdgesMesh });
  //state.entities.push({ map: true, debug: true, mesh: floorBBoxHelper });

  centerCamera(state, floorBBox);
}

//-----------------------------------------------------------------------------

function orderEdges(edges) {
  var sortedEdges = [];
  sortedEdges.push(edges.shift());
  while(edges.length > 0) {
    var lastEdge = sortedEdges[sortedEdges.length-1];
    var split = false;
    for(var i=0; i<edges.length; i++) {
      var edge = edges[i];
      if (lastEdge[1].distance(edge[0]) < EPSILON) {
        sortedEdges.push(edge);
        edges.splice(i, 1);
        split = true;
        break;
      }
      if (lastEdge[1].distance(edge[1]) < EPSILON) {
        sortedEdges.push(edge.reverse());
        edges.splice(i, 1);
        split = true;
        break;
      }
    }
    if (!split) {
      break;
    }
  }
  sortedEdges = sortedEdges.reverse().map(function(edge) {
    return edge.reverse();
  })
  while(edges.length > 0) {
    var lastEdge = sortedEdges[sortedEdges.length-1];
    var split = false;
    for(var i=0; i<edges.length; i++) {
      var edge = edges[i];
      if (lastEdge[1].distance(edge[0]) < EPSILON) {
        sortedEdges.push(edge);
        edges.splice(i, 1);
        split = true;
        break;
      }
      if (lastEdge[1].distance(edge[1]) < EPSILON) {
        sortedEdges.push(edge.reverse());
        edges.splice(i, 1);
        split = true;
        break;
      }
    }
    if (!split) {
      break;
    }
  }

  return sortedEdges;
}

//-----------------------------------------------------------------------------

function getRoomsCenters(cellGroups) {
  return Object.keys(cellGroups).filter(R.identity).map(function(roomId) {
    var cellNodes = cellGroups[roomId];
    var cellPoints = cellNodes.map(R.prop('position'));
    return GeomUtils.centroid(cellPoints);
  });
}

//-----------------------------------------------------------------------------

function closestPoint(points, p) {
  var best = points.reduce(function(best, node, nodeIndex) {
    var dist = node.squareDistance(p);
    if (dist < best.distance) {
      best.node = node;
      best.index = nodeIndex;
      best.distance = dist;
    }
    return best;
  }, { index: -1, distance: Infinity, node: null });

  return best.node;
}

//-----------------------------------------------------------------------------

//assumes ordered points
function findUniquePoints(points) {
  return points.filter(function(p, i) {
    if (i == 0) return true;
    return points[i-1].distance(p) > EPSILON;
  });
}

//-----------------------------------------------------------------------------

function makeSpring(start, end) {
  return {
    start: start,
    end: end,
    startBase: start.dup(),
    length: start.squareDistance(end)
  }
}

//-----------------------------------------------------------------------------

function rebuildCells(state) {
  var selectedNodes = state.map.selectedNodes;

  var points = selectedNodes.map(R.prop('position'));

  //room centers
  var cellGroups = fn.groupBy(state.map.selectedNodes, 'room');
  var roomCenterPoints = getRoomsCenters(cellGroups);
  points = points.concat(roomCenterPoints)

  //2d points

  var points2D = points.map(vec3to2);

  //boundary points

  var boundingRect = Rect.fromPoints(points2D);
  var center = boundingRect.getCenter();
  var size = boundingRect.getSize();
  var r = Math.max(size.x, size.y) / 2;
  for(var i=0; i<30; i++) {
    points2D.push(new Vec2(
      center.x + r * Math.cos(2 * Math.PI * i/30),
      center.y + r * Math.sin(2 * Math.PI * i/30)
    ))
  }

  //cells

  var points2D = points.map(vec3to2);

  var cells = voronoi(points2D);

  var uniquePoints = new PointSet3();
  cells = cells.map(function(cell, cellIndex) {
    cell.forEach(function(edge) {
      edge[0] = uniquePoints.add(vec2to3(edge[0]));
      edge[1] = uniquePoints.add(vec2to3(edge[1]));
      edge[0].roomIds = [];
      edge[1].roomIds = [];
      edge[0].basePos = edge[0].dup();
      edge[1].basePos = edge[1].dup();
    });

    return orderEdges(cell);
  });

  var cellsRoomIds = cells.map(function(cell, cellIndex) {
    var cellPoint = points[cellIndex];
    var roomIndex = roomCenterPoints.indexOf(cellPoint);
    if (roomIndex != -1) {
      return Object.keys(cellGroups).filter(R.identity)[roomIndex];
    }
    return -1;
  });

  var edgesVertices = R.flatten(cells);
  var edgesEdges = R.unnest(cells.map(function(cell, cellIndex) {
    return cell.map(function(edge) {
      var a = edge[0];
      var b = edge[1];
      a.roomIds.push(cellsRoomIds[cellIndex])
      b.roomIds.push(cellsRoomIds[cellIndex])
      return [edgesVertices.indexOf(a), edgesVertices.indexOf(b)]
    });
  }));

  //voronoi edges / corridors

  //var edgeMesh = new Mesh(new Geometry({ vertices: edgesVertices, edges: edgesEdges}), new SolidColor({ color: Color.fromHSV(0.4, 0.2, 0.9) }), { lines: true });
  var edgeMesh = new Mesh(new Geometry({ vertices: edgesVertices, edges: edgesEdges}), new SolidColor({ color: config.corridorColor }), { lines: true });
  state.entities.push({ map: true, bio: true, mesh: edgeMesh });

  //cell blobs

  var cellGeometry = new Geometry({ vertices: true, colors: true, faces: true });
  var cellVertices = cellGeometry.vertices;
  var cellFaces = cellGeometry.faces;
  var cellColors = cellGeometry.colors;

  var cellEdgeGeometry = new Geometry({ vertices: true, colors: true, edges: true });
  var cellEdgeVertices = cellEdgeGeometry.vertices;
  var cellEdgeEdges = cellEdgeGeometry.edges;
  var cellEdgeColors = cellEdgeGeometry.colors;

  var lineBuilder = new LineBuilder();

  cells.forEach(function(cell, cellIndex) {
    var roomId = cellsRoomIds[cellIndex];
    var isRoom = roomId != -1;
    var roomType = state.map.roomsById[roomId] ? state.map.roomsById[roomId].type : 'none';
    cell.uniquePoints = findUniquePoints(R.flatten(cell));

    var splinePoints = GeomUtils.smoothCurve(cell.uniquePoints, 0.9, 3);

    var center = GeomUtils.centroid(splinePoints);
    cell.center = center;

    for(var i=0; i<splinePoints.length; i++) {
      var p = splinePoints[i];
      var np = splinePoints[(i+1)%splinePoints.length];
      var p2 = p.dup().add(center.dup().sub(p).setLength(config.cellCloseness));
      var np2 = np.dup().add(center.dup().sub(np).setLength(config.cellCloseness));
      var vidx = cellVertices.length;
      var eidx = cellEdgeVertices.length;

      var cellColor = config.cellColor;
      var cellCenterColor = config.cellCenterColor;
      var cellEdgeColor = config.cellEdgeColor;

      if (isRoom) {
        if (roomType == 'classroom') {
          cellColor = config.classroomColor;
          cellCenterColor = config.classroomCenterColor;
          cellEdgeColor = config.classroomEdgeColor;
        }
        else if (roomType == 'toilet') {
          cellColor = config.toiletColor;
          cellCenterColor = config.toiletCenterColor;
          cellEdgeColor = config.toiletEdgeColor;
        }
        else {
          cellColor = config.otherRoomColor;
          cellCenterColor = config.otherRoomCenterColor;
          cellEdgeColor = config.otherRoomEdgeColor;
        }
      }

      cellVertices.push(p2);
      cellVertices.push(np2);
      cellVertices.push(center);
      cellColors.push(cellColor);
      cellColors.push(cellColor);
      cellColors.push(cellCenterColor);
      cellFaces.push([vidx, vidx+1, vidx+2]);

      cellEdgeVertices.push(p2.dup().add(new Vec3(0, 0, 0.001)));
      cellEdgeVertices.push(np2.dup().add(new Vec3(0, 0, 0.001)));
      cellEdgeColors.push(cellEdgeColor);
      cellEdgeColors.push(cellEdgeColor);
      cellEdgeEdges.push([eidx, eidx+1]);
    }
  })


  var cellEdgeMesh = new Mesh(cellEdgeGeometry, new ShowColors({ }), { lines: true });
  var cellMesh = new Mesh(cellGeometry, new ShowColors(), { faces: true });

  state.entities.push({ name: 'cellMesh', map: true, bio: true, mesh: cellMesh });
  state.entities.push({ name: 'cellEdgeMesh', map: true, bio: true, mesh: cellEdgeMesh, lineWidth: config.cellEdgeWidth });
  //state.entities.push({ map: true, mesh: pointsToMesh(cellPoints3) });
  //state.entities.push({ map: true, bio: true, mesh: pointsToMesh(roomCenterPoints, Color.Yellow) });
  //state.entities.push({ map: true, mesh: pointsToMesh(points, Color.Yellow) });

  MapSys.edgeMesh = edgeMesh;
  MapSys.cellMesh = cellMesh;
  MapSys.cellEdgeMesh = cellEdgeMesh;
  MapSys.cells = cells;
  MapSys.points = points;
  MapSys.cellsRoomIds = cellsRoomIds;
  MapSys.roomCenterPoints = roomCenterPoints;
}

//-----------------------------------------------------------------------------

function updateMap(state) {
  return;
  var count = 0;
  var roomValue;
  for(var i=0; i<MapSys.cells.length; i++) {
    var cell = MapSys.cells[i];
    var roomId = MapSys.cellsRoomIds[i];
    if (roomId != -1) {
      roomValue = state.selectedRooms[roomId];
      //if (roomValue != 0) console.log(i, roomId, roomValue)
      if (roomValue !== undefined) {
        for(var j=0; j<cell.length; j++) {
          var edge = cell[j];
          edge[0].setVec3(edge[0].basePos).lerp(cell.center, 1.0 - roomValue);
          edge[1].setVec3(edge[1].basePos).lerp(cell.center, 1.0 - roomValue);
        }
      }
    }
  }
  MapSys.edgeMesh.geometry.vertices.dirty = true;

  var idx = 0;
  var lidx = 0;
  MapSys.cells.forEach(function(cell, cellIndex) {
    var splinePoints = GeomUtils.smoothCurve(cell.uniquePoints, 0.9, 3);

    var center = GeomUtils.centroid(splinePoints);

    for(var i=0; i<splinePoints.length; i++) {
      var p = splinePoints[i];
      var np = splinePoints[(i+1)%splinePoints.length];
      var p2 = p.dup().add(center.dup().sub(p).setLength(config.cellCloseness));
      var np2 = np.dup().add(center.dup().sub(np).setLength(config.cellCloseness));

      MapSys.cellMesh.geometry.vertices[idx].setVec3(p2);
      MapSys.cellMesh.geometry.vertices[idx+1].setVec3(np2);
      MapSys.cellMesh.geometry.vertices[idx+2].setVec3(center);
      MapSys.cellEdgeMesh.geometry.vertices[lidx].setVec3(p2);
      MapSys.cellEdgeMesh.geometry.vertices[lidx+1].setVec3(np2);
      idx += 3;
      lidx += 2;
    }
  })

  MapSys.cellMesh.geometry.vertices.dirty = true;
  MapSys.cellMesh.geometry.colors.dirty = true;
  MapSys.cellEdgeMesh.geometry.vertices.dirty = true;
  MapSys.cellEdgeMesh.geometry.colors.dirty = true;
}

//-----------------------------------------------------------------------------

function update(state) {
  if (!state.map.nodes.length) {
    return;
  }

  if (!MapSys.ready || state.map.dirty) {
    MapSys.ready = true;
    state.map.dirty = false;
    rebuildMap(state);
  }
  else {
    updateMap(state);
  }
}

module.exports = update;