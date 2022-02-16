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
var tapisIO = require('vdj-tapis-js');
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

// receive notification from Tapis job
StatisticsController.statsNotify = async function(req, res) {
    var context = 'StatisticsController.statsNotify';
    var msg = null;

    config.log.info(context, 'Received LRQ notification id: ' + req.params.notify_id);

    // return a response
    res.status(200).json({"message":"notification received."});

    // search for metadata item based on notification id

    // verify that metadata is valid, owned by vdj, job had error?

    // check job is FINISHED

    // submit finish queue job to cache statistics

/*
    // search for metadata item based on notification id
    var lrq_id = req.body['result']['_id']
    console.log(lrq_id);
    var metadata = await agaveIO.getAsyncQueryMetadata(lrq_id)
        .catch(function(error) {
            msg = 'VDJ-ADC-ASYNC-API ERROR (asyncNotify): Could not get metadata for LRG id: ' + lrq_id + ', error: ' + error;
            console.error(msg);
            webhookIO.postToSlack(msg);
            return Promise.reject(new Error(msg));
        });

    // do some error checking
    console.log(metadata);
    if (metadata.length != 1) {
        msg = 'VDJ-ADC-ASYNC-API ERROR (asyncNotify): Expected single metadata entry but got ' + metadata.length + ' for LRG id: ' + lrq_id;
        console.error(msg);
        webhookIO.postToSlack(msg);
        return Promise.reject(new Error(msg));
    }
    metadata = metadata[0];
    if (metadata['uuid'] != req.params.notify_id) {
        msg = 'Notification id and LRQ id do not match: ' + req.params.notify_id + ' != ' + metadata['uuid'];
        console.error(msg);
        webhookIO.postToSlack(msg);
        return Promise.reject(new Error(msg));
    }

    if (metadata['value']['status'] == 'COUNTING') {
        // if this is a count query
        // get the count
        var filename = config.lrqdata_path + 'lrq-' + metadata["value"]["lrq_id"] + '.json';
        var countFail = false;
        var count_obj = await readCountFile(filename)
            .catch(function(error) {
                msg = 'VDJ-ADC-ASYNC-API ERROR (asyncNotify): Could not read count file (' + filename + ') for LRQ ' + metadata["uuid"] + '.\n' + error;
                console.error(msg);
                webhookIO.postToSlack(msg);
                countFail = true;
                console.log(countFail);
                console.log(metadata);
                //return Promise.reject(new Error(msg));
            });
        console.log('fall through');
        console.log(metadata);
        console.log(countFail);
        console.log(count_obj);

        // error if the count is greater than max size
        if (countFail || (count_obj['total_records'] > config.async.max_size)) {
            console.log('got here');
            metadata['value']['status'] = 'ERROR';
            if (countFail) {
                metadata['value']['message'] = 'Could not read count file';
            } else {
                metadata['value']['message'] = 'Result size (' + count_obj['total_records'] + ') is larger than maximum size (' + config.async.max_size + ')';
            }
            msg = 'VDJ-ADC-ASYNC-API ERROR (asyncNotify): Query rejected: ' + metadata["uuid"] + ', ' + metadata['value']['message'];
            console.error(msg);
            webhookIO.postToSlack(msg);

            await agaveIO.updateMetadata(metadata['uuid'], metadata['name'], metadata['value'], null)
                .catch(function(error) {
                    msg = 'VDJ-ADC-ASYNC-API ERROR (asyncNotify): Could not update metadata for LRQ ' + metadata["uuid"] + '.\n' + error;
                    console.error(msg);
                    webhookIO.postToSlack(msg);
                    return Promise.reject(new Error(msg));
                });

            if (metadata["value"]["notification"]) {
                var notify = asyncQueue.checkNotification(metadata);
                if (notify) {
                    var data = asyncQueue.cleanStatus(metadata);
                    await agaveIO.sendNotification(notify, data)
                        .catch(function(error) {
                            var cmsg = 'VDJ-ADC-ASYNC-API ERROR (countQueue): Could not post notification.\n' + error;
                            console.error(cmsg);
                            webhookIO.postToSlack(cmsg);
                        });
                }
            }
            return Promise.resolve();
        }

        // update metadata status
        metadata['value']['count_lrq_id'] = metadata['value']['lrq_id'];
        metadata['value']['status'] = 'COUNTED';
        await agaveIO.updateMetadata(metadata['uuid'], metadata['name'], metadata['value'], null)
            .catch(function(error) {
                msg = 'VDJ-ADC-ASYNC-API ERROR (asyncNotify): Could not update metadata for LRQ ' + metadata["uuid"] + '.\n' + error;
                console.error(msg);
                webhookIO.postToSlack(msg);
                return Promise.reject(new Error(msg));
            });

        // otherwise submit the real query
        submitQueue.add({metadata: metadata});

        return Promise.resolve();

    } else {
        if (req.body['status'] == 'FINISHED') {
            metadata['value']['status'] = 'PROCESSING';
            metadata['value']['raw_file'] = req.body['result']['location'];
        } else {
            // TODO: what else besides FINISHED?
            metadata['value']['status'] = req.body['status'];
        }

        // update with additional info
        // TODO: should we retry on error?
        var new_metadata = await agaveIO.updateMetadata(metadata['uuid'], metadata['name'], metadata['value'], null)
            .catch(function(error) {
                msg = 'VDJ-ADC-ASYNC-API ERROR (countQueue): Could not update metadata for LRQ ' + metadata["uuid"] + '.\n' + error;
                console.error(msg);
                webhookIO.postToSlack(msg);
            });

        if (new_metadata) {
            // submit queue job to finish processing
            finishQueue.add({metadata: new_metadata});
        }
    }
*/
    return Promise.resolve();
}
