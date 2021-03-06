var request = require('superagent');
var Promise = require('bluebird');
var Faye = require('faye');
var R = require('ramda');
var AgentStore = require('../stores/AgentStore');
var AgentModes = require('../agents/agentModes');
var log = require('debug')('ucc-data/client');
var request = require('superagent');

function Client(serverUrl) {
  log(serverUrl);
  this.enabled = true;
  this.serverUrl = serverUrl;
  this.online = undefined;
}

Client.prototype.getJSON = function(url) {
  //log('Client.getJSON', url);
  return new Promise(function(resolve, reject) {
    request(url, function(err, res) {
      if (err) reject(err);
      else resolve(JSON.parse(res.text));
    })
  });
}

Client.prototype.checkServerConnection = function() {
  log('checkServerConnection');
  request
  .get(this.serverUrl + '/current-state/')
  .end(function(err, res){
     if (err) {
      log("ERR Server is NOT available. Reconnecting in 10s...");
      this.online = false;
      setTimeout(this.checkServerConnection.bind(this), 10000)
     }
     else {
      log("Server is available. Connecting...");
      this.online = true;
      this.subscribeToEvents();
     }
  }.bind(this));
}

Client.prototype.subscribeToEvents = function() {
  log('Client.subscribeToEvents');
  this.fayeClient = new Faye.Client(this.serverUrl + '/faye');
  this.fayeClient.subscribe('/events', this.onEvent.bind(this));
  this.updateCurrentState();
}

Client.prototype.getAgentInfo = function(agentId) {
  return this.getJSON(this.serverUrl + '/agent/' + agentId);
}

Client.prototype.updateConfig = function() {
  return this.getJSON(this.serverUrl + '/client-config');
}

Client.prototype.updateCurrentState = function() {
  this.getJSON(this.serverUrl + '/current-state').then(function(agentsState) {
    var agentIds = Object.keys(agentsState);

    if (agentIds.length == 0) {
      setTimeout(this.updateCurrentState.bind(this), 500);
      return;
    }
    //log('Client.updateCurrentState agents:', agentIds.length);
    //log('Client.updateCurrentState', agentsState[agentIds[0]]);

    AgentStore.all = [];
    agentIds.forEach(function(agentId) {
      var agentState = agentsState[agentId];
      var agent = {
        id: agentId
      }
      // TODO: this should maybe be moved/refactored into agentSpawnSys.js, - and actually shouldn't be a heuristic on name, but use the server-supplied type of agent..
      if (agentId.match(/^student/)) { agent.type = 'student'; };
      if (agentId.match(/^teacher/)) { agent.type = 'teacher'; agent.programme = 'Teacher'; }
      if (agentId.match(/^researcher/)) { agent.type = 'researcher'; agent.programme = 'Researcher'; }
      if (agentId.match(/^janitor/)) { agent.type = 'janitor'; agent.programme = 'Janitor'; }
      if (agentId.match(/^cook/)) { agent.type = 'cook'; agent.programme = 'Cook'; }
      if (agentId.match(/^admin/)) { agent.type = 'admin'; agent.programme = 'Admin'; }

      if (agentState.description == 'away') {
        agent.targetMode = AgentModes.Away;
      }
      else if (agentState.location) {
        agent.targetMode = AgentModes.Classroom;
        agent.targetLocation = agentState.location;
      }

      //if (agent.)
      AgentStore.all.push(agent);
    })

    //log('Client.updateCurrentState', AgentStore.all.length);
  }.bind(this));
}

Client.prototype.onEvent = function(e) {
  if (!this.enabled) return;
  //log('Client.onEvent', e.description);
  e.agents.forEach(function(agentId) {
    var agent = AgentStore.getAgentById(agentId);
    if (!agent) {
      // This if-branch was originally
      //
      //     //log('WARN', 'Client.onEvent agent not found!', agentId);
      //     return;
      //
      // which led to missing agents, as events might contain links to new agents,
      // so I have replaced it with:
      
      agent = { id: agentId };
      AgentStore.all.push(agent);

      // and then I believe that agentSpawnSys.js will load/add
      // agent information from the api-server?
    }
    if (e.description == 'away') {
      //log('Client.onEvent', agentId, 'is going away')
      agent.targetMode = AgentModes.Away;
    }
    else if (e.description == 'roaming') {
      //log('Client.onEvent', agentId, 'is going roaming')
      agent.targetMode = AgentModes.Roaming;
    }
    else if (e.description == 'random toilet') {
      agent.targetMode = AgentModes.Toilet;
      // BUG/TODO: is location e.location(=="random toilet" or should it be "toilet"?)
      agent.targetLocation = e.location;
    }
    else if (e.description == 'random lunch') {
      agent.targetMode = AgentModes.Lunch;
      agent.targetLocation = e.location;
      //log(e);
    }
    else if (e.location) {
      //log('Client.onEvent', agentId, 'is going from', agent.targetLocation, 'to', e.location);
      agent.targetMode = AgentModes.Classroom;
      agent.targetLocation = e.location;
    }
    //else {
    //  log('Client.onEvent', agentId, e);
    //}
  })
}

module.exports = Client;
