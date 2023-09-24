'use strict'

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'assert/strict'
import { IrcAdapter } from './IrcAdapter.mjs'
import EventEmitter from 'events'

class MockClient extends EventEmitter {
    constructor() {
        super()
        this.nick = 'test'
        this.opt = {
            channels: ['#test'],
            server: 'test.irc.net',
            port: 6667,
            debug: true
        }
    }
    async say () {

    }
    async send () {

    }
}
describe('IrcBot', () => {
    let robot = null
    beforeEach(() => {
        robot = {
            receive() {
                return
            },
            logger: {
                debug() {
                    return
                },
                error() {
                    console.error(...arguments)
                }
            },
            config: {
                nick: 'test',
                rooms: ['#test'],
                server: 'test.irc.net',
                port: 6667
            }
        }
    })
    describe('Public API', () => {
        let adapter = null
        beforeEach(async () => {
            adapter = new IrcAdapter(robot, new MockClient())
            await adapter.run()
        })
        afterEach(() => {
            adapter.close()
        })

        it('assigns robot', () => {
            assert.deepEqual(adapter.robot, robot)
        })
        it('message sending functions', () => {
            ['send', 'reply', 'topic', 'play', 'run', 'close'].forEach((name) => {
                assert.ok(typeof adapter[name] === 'function')
            })
        })

        it('does nothing', async () => {
            const tasks = ['send', 'reply', 'topic', 'play', 'run', 'close'].map((name) => {
                return adapter[name]({
                    room: '#test',
                    user: {
                        name: 'test',
                        room: '#test'
                    }
                }, 'nothing')
            })
            try {
                await Promise.all(tasks)
                assert.ok(true)
            } catch (e) {
                assert.fail('should not throw an error')
            }
        })
    })

    describe('Adapter use', () => {
        it('dispatches received messages to the robot', async () => {
            let wasCalled = false
            robot.receive = async (message) => {
                wasCalled = true
                assert.equal(message.text, expected.text)
            }
            const adapter = new IrcAdapter(robot, new MockClient())
            const expected = { text: 'hello' }
            await adapter.receive({ text: 'hello', user: { name: 'test' }, room: '#test' } )
            assert.deepEqual(wasCalled, true)
        })
    })
})