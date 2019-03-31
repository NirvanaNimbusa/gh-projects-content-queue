/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/**
 * @module sources/issues
 * @license MPL-2.0
 */
"use strict";

const Source = require("./source");

/**
 * @alias module:sources/issues.IssuesSource
 * @extends module:sources/source.Source
 */
class IssuesSource extends Source {
    static get requiredColumns() {
        return [
            "target"
        ];
    }

    /**
     * @inheritdoc
     */
    constructor(...args) {
        super(...args);

        //TODO check existing issues
        this._board.ready.then(() => {
            this._repo.issues.on("opened", (issue) => this.addIssue(issue).catch(console.error));
            this._repo.issues.on("closed", (issue) => this.onClosedIssue(issue));
            return this.backfillIssues();
        });
    }

    async backfillIssues() {
        const issues = await this._repo.issues.issues;
        for(const issue of issues.values()) {
            await this.addIssue(issue);
        }
        const closedIssues = await this._repo.issues.closedIssues;
        for(const closedIssue of closedIssues.values()) {
            await this.onClosedIssue(closedIssue);
        }
    }

    async onClosedIssue(issue) {
        try {
            const column = await this.handleCard(issue);
            if(column !== null) {
                const card = await column.getCard(issue.id);
                if(card) {
                    try {
                        await column.removeCard(card);
                    }
                    catch(e) {
                        await card.reportError('Handling closed issue', e);
                    }
                }
            }
        } catch(e) {
            console.error("Handling closed issue", issue.id, e);
        }
    }

    /**
     * @param {module:issue.Issue} issue - Issue to handle.
     * @returns {module:column.Column?} Column where the issue is in.
     */
    async handleCard(issue) {
        const [ columns, managed ] = await Promise.all([
            this._board.columns,
            this._getManagedColumns()
        ]);
        for(const column of Object.values(columns)) {
            if(column && managed.every((c) => c.id !== column.id) && (await column.hasIssue(issue.number))) {
                return column;
            }
        }
        return null;
    }

    /**
     * @param {module:issue.Issue} issue - Issue to add to the default column.
     * @param {boolean} [isClosed=false] - Issue is closed.
     * @returns {module:tweet-card.TweetCard?} Created tweet card.
     */
    async addIssue(issue, isClosed = false) {
        const columns = await this._board.columns;
        for(const column of Object.values(columns)) {
            if(column && (await column.hasIssue(issue.number))) {
                return this._board.addCard(issue, column);
            }
        }
        if(!isClosed) {
            const ideas = await this.getColumn('target');
            // If the card is in no other column add it to the backlog.
            return this._board.addCard(issue, ideas);
        }
    }
}
module.exports = IssuesSource;
