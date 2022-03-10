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

// Controllers
var apiResponseController = require('./apiResponseController');

// Queues
var statisticsQueue = require('../queues/cache-queue');

// Processing
var tapisIO = require('vdj-tapis-js');
var ServiceAccount = tapisIO.serviceAccount;
var webhookIO = require('../vendor/webhookIO');

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

//
// Admin
//

// singleton statistics cache status
StatisticsController.getStatisticsCacheStatus = async function(request, response) {
    var context = 'StatisticsController.getStatisticsCacheStatus';
    var msg = null;

    // get list from metadata
    var cache = await tapisIO.getStatisticsCache()
        .catch(function(error) {
            msg = config.log.error(context, 'Error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return response.status(500).json({"message":msg});
    }

    if (cache && cache.length == 1) {
        return response.status(200).json(cache[0]['value']);
    } else {
        msg = config.log.error(context, 'Could not retrieve statistics_cache entry.');
        webhookIO.postToSlack(msg);
        return response.status(500).json({"message":msg});
    }
};

// update statistics cache status
StatisticsController.updateStatisticsCacheStatus = async function(request, response) {
    var context = 'StatisticsController.updateStatisticsCacheStatus';
    var msg = null;
    var operation = request.body.operation;

    // get singleton metadata entry
    var cache = await tapisIO.getStatisticsCache()
        .catch(function(error) {
            msg = config.log.error(context, 'Error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return response.status(500).json({"message":msg});
    }

    if (cache && cache.length == 1) {
        var value = cache[0]['value'];
        config.log.info(context, 'current enable_cache = ' + value['enable_cache']);

        if (operation == 'enable') value['enable_cache'] = true;
        if (operation == 'disable') value['enable_cache'] = false;
        if (operation == 'trigger') value['enable_cache'] = true;

        // update
        await tapisIO.updateMetadata(cache[0]['uuid'], cache[0]['name'], value, null)
            .catch(function(error) {
                msg = config.log.error(context, 'Error while updating: ' + error);
            });
        if (msg) {
            webhookIO.postToSlack(msg);
            return response.status(500).json({"message":msg});
        }

        if (operation == 'disable') {
            // clear the queue jobs
            statisticsQueue.clearQueues();
        }

        if (operation == 'trigger') {
            // trigger the process
            statisticsQueue.triggerCache();
        }

        config.log.info(context, 'updated enable_cache = ' + value['enable_cache']);
        response.status(200).json({"message":"Updated."});
    } else {
        msg = config.log.error(context, 'could not retrieve metadata entry.');
        webhookIO.postToSlack(msg);
        return response.status(500).json({"message":msg});
    }
};

// list statistics cache study entries
StatisticsController.getStatisticsCacheStudyList = async function(request, response) {
    var context = 'StatisticsController.getStatisticsCacheStudyList';
    var msg = null;

    // get list, hard-coded to vdjserver repository
    var cached_studies = await tapisIO.getStatisticsCacheStudyMetadata('vdjserver')
        .catch(function(error) {
            msg = config.log.error(context, 'Error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return response.status(500).json({"message":msg});
    }

    // clean up the output results
    var results = [];
    for (var i in cached_studies) {
        var entry = cached_studies[i]['value'];
        entry['cache_uuid'] = cached_studies[i]['uuid'];
        results.push(entry);
    }

    return response.status(200).json(results);
};

// update statistics cache for study
StatisticsController.updateStatisticsCacheForStudy = async function(request, response) {
    var context = 'StatisticsController.updateStatisticsCacheForStudy';
    var msg = null;
    var should_cache = request.body.should_cache;
    var cache_uuid = request.params.cache_uuid;

    config.log.info(context, 'Update statistics study cache with cache uuid: ' + cache_uuid);

    // is there a cache record?
    var metadata = await tapisIO.getMetadata(cache_uuid)
        .catch(function(error) {
            msg = config.log.error(context, 'Could not get cache uuid: ' + cache_uuid + ', error: ' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return response.status(400).json({"message":msg});
    }

    if (! metadata) {
        msg = config.log.error(context, 'could not retrieve cache entry.');
        webhookIO.postToSlack(msg);
        return response.status(400).json({"message":msg});
    }

    // valid type?
    if (metadata['name'] != 'statistics_cache_study') {
        msg = config.log.error(context, 'Cache uuid: ' + cache_uuid + ' is not statistics_cache_study');
        webhookIO.postToSlack(msg);
        return response.status(400).json({"message":msg});
    }

    // update
    metadata['value']['should_cache'] = should_cache;
    await tapisIO.updateMetadata(metadata['uuid'], metadata['name'], metadata['value'], null)
        .catch(function(error) {
            msg = config.log.error(context, 'Error while updating: ' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return response.status(500).json({"message":msg});
    }

    response.status(200).json({"message":"Updated."});
};

// update statistics cache for repertoire
StatisticsController.updateStatisticsCacheForRepertoire = async function(request, response) {
    var context = 'StatisticsController.updateStatisticsCacheForRepertoire';
    var msg = null;
    var repertoire_id = request.params.repertoire_id;
    var should_cache = request.body.should_cache;

    config.log.info(context, 'Update statistics cache for repertoire id: ' + repertoire_id);

    // is there a cache record?
    // we assume vdjserver repository, unknown study
    let stats_entries = await tapisIO.getStatisticsCacheRepertoireMetadata('vdjserver', null, repertoire_id)
        .catch(function(error) {
            msg = config.log.error(context, 'Error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return response.status(500).json({"message":msg});
    }

    // repertoire_id is unique, so should only be one
    if (!stats_entries || stats_entries.length != 1) {
        msg = config.log.error(context, 'Could not retrieve cache entry for repertoire: ' + repertoire_id);
        webhookIO.postToSlack(msg);
        return response.status(400).json({"message":msg});
    }
    let entry = stats_entries[0];

    // update
    entry['value']['should_cache'] = should_cache;
    await tapisIO.updateMetadata(entry['uuid'], entry['name'], entry['value'], null)
        .catch(function(error) {
            msg = config.log.error(context, 'Error while updating: ' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return response.status(500).json({"message":msg});
    }

    response.status(200).json({"message":"Updated."});
};

// clear statistics cache for a single study
// this doesn't disable caching but does set is_cached to false
StatisticsController.clearStudyCache = async function(request, response) {
    var context = 'StatisticsController.clearStudyCache';
    var msg = null;
    var cache_uuid = request.params.cache_uuid;

    config.log.info(context, 'Clear statistics study cache for cache uuid: ' + cache_uuid);

    // is there a cache record?
    var metadata = await tapisIO.getMetadata(cache_uuid)
        .catch(function(error) {
            msg = config.log.error(context, 'Could not get cache uuid: ' + cache_uuid + ', error: ' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return response.status(400).json({"message":msg});
    }

    if (! metadata) {
        msg = config.log.error(context, 'could not retrieve cache entry.');
        webhookIO.postToSlack(msg);
        return response.status(400).json({"message":msg});
    }

    // valid type?
    if (metadata['name'] != 'statistics_cache_study') {
        msg = config.log.error(context, 'Cache uuid: ' + cache_uuid + ' is not statistics_cache_study');
        webhookIO.postToSlack(msg);
        return response.status(400).json({"message":msg});
    }

    // clear it
    config.log.info(context, 'Clearing statistics study cache for cache_uuid: ' + metadata['uuid']);
    statisticsQueue.triggerClearCache(metadata['uuid']);

    // return a response
    response.status(200).json({"message":"study cache clear has been queued."});
};

// clear statistics cache for a single repertoire
// this doesn't disable caching but does set is_cached to false
StatisticsController.clearRepertoireCache = async function(request, response) {
    var context = 'StatisticsController.clearRepertoireCache';
    var msg = null;
    var repertoire_id = request.params.repertoire_id;

    config.log.info(context, 'Clear statistics cache for repertoire id: ' + repertoire_id);

    // is there a cache record?
    // we assume vdjserver repository, unknown study
    let stats_entries = await tapisIO.getStatisticsCacheRepertoireMetadata('vdjserver', null, repertoire_id)
        .catch(function(error) {
            msg = config.log.error(context, 'Error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return response.status(500).json({"message":msg});
    }

    // repertoire_id is unique, so should only be one
    if (!stats_entries || stats_entries.length != 1) {
        msg = config.log.error(context, 'Could not retrieve metadata entry for repertoire: ' + repertoire_id);
        webhookIO.postToSlack(msg);
        return response.status(400).json({"message":msg});
    }
    let entry = stats_entries[0];

    // clear it
    config.log.info(context, 'Clearing statistics cache for cache_uuid: ' + entry['uuid']);
    statisticsQueue.triggerClearCache(entry['uuid']);

    // return a response
    response.status(200).json({"message":"cache clear has been queued."});
};

// receive notification from Tapis job
StatisticsController.statsNotify = async function(req, res) {
    var context = 'StatisticsController.statsNotify';
    var msg = null;
    var cache_uuid = req.params.cache_uuid;
    var job_status = req.query.status;
    var job_event = req.query.event;
    var job_error = req.query.error;

    config.log.info(context, 'Received statistics job notification id: ' + cache_uuid
                    + ', status: ' + job_status + ', event: ' + job_event + ', error: ' + job_error);

    // return a response
    res.status(200).json({"message":"notification received."});

    // only care about the end states
    if ((job_status != 'FINISHED') && (job_status != 'FAILED'))
        return Promise.resolve();

    // search for metadata item based on notification id
    var metadata = await tapisIO.getMetadata(cache_uuid)
        .catch(function(error) {
            msg = config.log.error(context, 'Could not get cache uuid: ' + cache_uuid + ', error: ' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    // verify that metadata is valid, owned by vdj, job had error?
    if (! metadata) {
        msg = config.log.error(context, 'could not retrieve cache entry.');
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    // valid type?
    if (metadata['name'] != 'statistics_cache_repertoire') {
        msg = config.log.error(context, 'Cache uuid: ' + cache_uuid + ' is not statistics_cache_repertoire');
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    // have job?
    if (! metadata['value']['statistics_job_id']) {
        msg = config.log.error(context, 'Cache uuid: ' + cache_uuid + ' does not have statistics job id');
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    // check job
    let job_entry = await tapisIO.getJobOutput(metadata['value']['statistics_job_id'])
        .catch(function(error) {
            msg = config.log.error(context, 'error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    if (! job_entry) {
        msg = config.log.error(context, 'Cache uuid: ' + cache_uuid + ' has invalid statistics job id: ' + metadata['value']['statistics_job_id']);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    // correct job status?
    if (job_entry['status'] != job_status) {
        msg = config.log.error(context, 'Cache uuid: ' + cache_uuid + ' has job status that does not match notification,  '
                               + job_entry['status'] + ' != ' + job_status);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    // submit finish queue job to cache statistics
    statisticsQueue.finishStatistics(cache_uuid);

    return Promise.resolve();
}
