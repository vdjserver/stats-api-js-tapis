'use strict';

//
// statsController.js
// Process statistics requests
//
// VDJServer Community Data Portal
// Statistics API service
// https://vdjserver.org
//
// Copyright (C) 2020 The University of Texas Southwestern Medical Center
//
// Author: Scott Christley <scott.christley@utsouthwestern.edu>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
//

var StatisticsController = {};
module.exports = StatisticsController;

// Server config
var config = require('../config/config');
//var mongoSettings = require('../config/mongoSettings');

// Controllers
var apiResponseController = require('./apiResponseController');

// Processing
var tapisIO = require('tapis-js');
var ServiceAccount = tapisIO.serviceAccount;

// rearrangement counts
StatisticsController.RearrangementCount = async function(request, response) {
    if (config.debug) console.log("VDJ-STATS-API INFO: StatisticsController.RearrangementCount");
    console.log(request.body);

    return apiResponseController.notImplemented(request, response);
/*
    const client = new MongoClient(url);
    try {
        await client.connect();
        if (config.debug) console.log("VDJ-STATS-API INFO: Connected successfully to mongo");

        var v1airr = client.db(mongoSettings.dbname);
        var collection = await v1airr.collection('rearrangement');

        console.log(request.body.repertoires);
        if ((!request.body.repertoires) || (request.body.repertoires.length == 0)) {
            // empty array means total count
            console.log('all');
            var result = await collection.estimatedDocumentCount();
            console.log(result);
            apiResponseController.sendSuccess({"total_count":result}, response);
        } else {
            // otherwise get count for each repertoire
            console.log('list');
            var total_count = 0;
            var rearrangement_count = {};
            var query = {};
            for (var i = 0; i < request.body.repertoires.length; ++i) {
                query['repertoire_id'] = request.body.repertoires[i];
                console.log(query);
                var result = await collection.countDocuments(query);
                console.log(result);
                rearrangement_count[request.body.repertoires[i]] = result;
                total_count += result;
            }
            apiResponseController.sendSuccess({"total_count":total_count,"counts":rearrangement_count}, response);
        }
    } catch (err) {
        console.error("VDJ-STATS-API ERROR: Could not connect to database");
        return apiResponseController.sendError("Internal Error", 500, response);
    }
    client.close(); */
};

// clone counts
StatisticsController.CloneCount = async function(request, response) {
    if (config.debug) console.log("VDJ-STATS-API INFO: StatisticsController.CloneCount");

    return apiResponseController.notImplemented(request, response);
};
