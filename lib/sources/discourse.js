/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/**
 * @module sources/discourse
 * @license MPL-2.0
 */
"use strict";

const Source = require("./source");
const Formatter = require("../formatters/formatter");
const self = require("../self");

class DiscourseSource extends Source {
    static getDiscourseCardContent(thread, config) {
        return Formatter.Format(`[__${thread.title}__](${thread.slug})

> ${thread.excerpt}`, undefined, config);
    }

    static getTitle(thread, config) {
        return `${thread.title} (${config.forum})`;
    }

    static get requiredConfig() {
        return super.requiredConfig.concat([
            'accountName'
        ]);
    }

    static get requiredColumns() {
        return [
            'target'
        ];
    }

    constructor(...args) {
        super(...args);

        this.discourse = this._accountManager.getAccount('discourse', this._config.accountName);

        this.discourse.on('created', (thread) => this.handleThread(thread));
    }

    async getThread(thread) {
        await this._board.ready;
        const issues = await this._repo.issues.issues;
        const allIssues = Array.from(issues.values()).concat(Array.from((await this._repo.issues.closedIssues).values()));
        const title = self(this).getTitle(thread, this._config);
        for(const issue of allIssues) {
            if(issue.title === title) {
                return issue;
            }
        }
        return false;
    }

    async addThread(thread) {
        return this._board.createCard(
            self(this).getTitle(thread, this._config),
            self(this).getEventCardContent(thread, this._board.config),
            await this.getColumn('target')
        );
    }

    async handleThread(thread) {
        if(!(await this.getThread(thread))) {
            await this.addThread(thread);
        }
    }
}

module.exports = DiscourseSource;
