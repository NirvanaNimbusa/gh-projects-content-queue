/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/**
 * @module sources/manager
 * @license MPL-2.0
 */
"use strict";

const self = require("../self");

class SourceLoadError extends Error {
    constructor(message, sourceType) {
        super(`Error when reading configuration for source ${sourceType}: ${message}`);
        this.sourceType = sourceType;
    }
}

/**
 * @alias module:sources/manager.SourceManager
 */
class SourceManager {
    /**
     * Types that would resolve but are not sources.
     *
     * @type {[string]}
     * @readonly
     */
    static get NOT_SOURCES() {
        return [
            'manager',
            'source'
        ];
    }

    constructor(config, repo, accountManager, board) {
        this.sources = new Set();
        this.sourceFactories = new Map();
        this.managedColumns = new Set();

        this._config = config;
        this._repo = repo;
        this._accountManager = accountManager;
        this._board = board;

        if(Array.isArray(config.sources) && config.sources.length) {
            for(const s of config.sources) {
                const Source = this.getSourceFactory(s.type);
                if(this.checkSourceConfig(s)) {
                    this.sources.add(new Source(this._repo, this._accountManager, this._board, s, () => this.getManagedColumns()));
                    if(Source.managedColumns.length) {
                        for(const c of Source.managedColumns) {
                            this.managedColumns.add(s.columns[c]);
                        }
                    }
                }
                else {
                    const missingConfig = self(this).missingConfig(Source.requiredConfig, s);
                    if(!missingConfig.length) {
                        const missingColumns = self(this).missingConfig(Source.requiredColumns, s.columns);
                        throw new SourceLoadError(`Missing column names: ${missingColumns.join(",")}`, s.type);
                    }
                    throw new SourceLoadError(`Missing the following config keys: ${missingConfig.join(",")}`, s.type);
                }
            }
        }
    }

    /**
     * @returns {[Column]} Columns managed by source instances.
     */
    async getManagedColumns() {
        const [ columns, columnIds ] = await Promise.all([
            this._board.columns,
            this._board.columnIds
        ]);
        return Array.from(this.managedColumns.values(), (name) => columns[columnIds[name]]);
    }

    /**
     * Caches source constructors once they were loaded via require().
     *
     * @param {string} sourceType - Type of the source factory to get.
     * @returns {Source} Constructor for the requested source type.
     * @throws {module:sources/manager~SourceLoadError} When requesting an invalid source type.
     */
    getSourceFactory(sourceType) {
        if(self(this).NOT_SOURCES.includes(sourceType)) {
            throw new SourceLoadError("It is not a source.");
        }
        if(!this.sourceFactories.has(sourceType)) {
            this.sourceFactories.set(sourceType, require(`./${sourceType}`));
        }
        return this.sourceFactories.get(sourceType);
    }

    /**
     * @param {[string]} required - Required keys.
     * @param {Object} config - Configuration to check.
     * @returns {boolean} If the config contains all required keys.
     */
    static checkConfigArray(required, config) {
        return !required.length || required.every((c) => c in config);
    }

    /**
     * @param {[string]} required - Required keys.
     * @param {Object} config - Configuration to check against.
     * @returns {[string]} Keys that are not in the config.
     */
    static missingConfig(required, config) {
        return required.filter((c) => !(c in config));
    }

    /**
     * @param {Object} sourceConfig - Source configuration to check.
     * @returns {boolean} Whether the configuration is valid.
     */
    checkSourceConfig(sourceConfig) {
        const Source = this.getSourceFactory(sourceConfig.type);
        return self(this).checkConfigArray(Source.requiredConfig, sourceConfig)
            && self(this).checkConfigArray(Source.requiredColumns, sourceConfig.columns);
    }
}

module.exports = SourceManager;
