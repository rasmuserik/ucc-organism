var Time = require('pex-sys').Time;

function displacePointUpdaterSys(state) {
  state.map.strongDisplacePoints.forEach(function(point) {
    //WEAK ANIMATION
    //not sure if i understand the max possible value here
    point.targetStrength = -0.1 + 0.2 * (0.5 * Math.sin(Time.seconds + Math.PI * 2 * point.timeOffset));

    var room = state.map.getRoomById(point.roomId);
    if (room && room.agentCount) {
      point.targetStrength = 0.005 * room.agentCount;
    }

    //avoid popping
    point.strength += (point.targetStrength - point.strength) * 0.01;
  })
}


module.exports = displacePointUpdaterSys;