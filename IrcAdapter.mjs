import { TextMessage, EnterMessage, LeaveMessage, Response, Adapter } from 'hubot'

class IrcResponse extends Response {
    async sendPrivate(...strings) {
        return await this.robot.adapter.sendPrivate(this.envelope, ...strings)
    }
}

class IrcAdapter extends Adapter {
  #bot = null
  #client = null
  constructor(robot, client) {
      super(robot)
        this.#client = client
  }
  async send(envelope, ...strings) {
    // Use @notice if SEND_NOTICE_MODE is set
    let target
    if (this.robot.config.isSendNoticeModeOn) {
        return this.notice(envelope, strings)
    }

    target = this.#getTargetFromEnvelope(envelope)
    if (!target) {
      return this.robot.logger.error("ERROR: Not sure who to send to. envelope=", envelope)
    }

    const result = []
    console.log('target', target)
    for (let str of strings) {
      this.robot.logger.debug(`${target} ${str}`)
      result.push(this.#client.say(target, str))
    }
    return result
  }

  async sendPrivate(envelope, ...strings) {
    // Remove the room from the envelope and send as private message to user

    if (envelope.room) {
      delete envelope.room
    }

    if (envelope.user != null ? envelope.user.room : undefined) {
      delete envelope.user.room
    }

    return await this.send(envelope, ...strings)
  }

  async topic(envelope, ...strings) {
    const data = strings.join(" / ")
    const channel = envelope.room
    return this.#client.send('TOPIC', channel, data)
  }

  async emote(envelope, ...strings) {
    // Use @notice if SEND_NOTICE_MODE is set
    if (process.env.HUBOT_IRC_SEND_NOTICE_MODE != null) {
        return this.notice(envelope, strings)
    }

    const target = this.#getTargetFromEnvelope(envelope)

    if (!target) {
      return this.robot.logger.error("ERROR: Not sure who to emote to. envelope=", envelope)
    }

    return strings.map((str) => this.#client.action(target, str))
  }

  notice(envelope, ...strings) {
    let str
    const target = this.#getTargetFromEnvelope(envelope)

    if (!target) {
      return this.robot.logger.warn("Notice: no target found", envelope)
    }

    // Flatten out strings from send
    let flattened = []
    for (str of strings) {
      if (typeof str !== 'undefined') {
        for (let line of Array.from(str.toString().split(/\r?\n/))) {
          if (Array.isArray(line)) {
            flattened = flattened.concat(line)
          } else {
            flattened.push(line)
          }
        }
      }
    }

    const result = []
    for (str of Array.from(flattened)) {
      if ((str == null)) {
        continue
      }

      result.push(this.#client.notice(target, str))
    }
    return result
  }

  async reply(envelope, ...strings) {
    const tasks = strings.map((str) => this.send(envelope.user, `${envelope.user.name}: ${str}`))
    return await Promise.all(tasks)
  }

  join(channel) {
    return this.#client.join(channel, async () => {
      this.robot.logger.info('joined %s', channel)

      const selfUser = this.getUserFromName(this.robot.name)
      return await this.receive(new EnterMessage(selfUser))
    })
  }

  part(channel) {
    return this.#client.part(channel, async () => {
      this.robot.logger.info('left %s', channel)

      const selfUser = this.getUserFromName(this.robot.name)
      return await this.receive(new LeaveMessage(selfUser))
    })
  }

  getUserFromName(name) {
    if ((this.robot.brain != null ? this.robot.brain.userForName : undefined) != null) { return this.robot.brain.userForName(name) }

    // Deprecated in 3.0.0
    return this.userForName(name)
  }

  getUserFromId(id) {
    // TODO: Add logic to convert object if name matches
    if ((this.robot.brain != null ? this.robot.brain.userForId : undefined) != null) { return this.robot.brain.userForId(id) }

    // Deprecated in 3.0.0
    return this.userForId(id)
  }

  createUser(channel, from) {
    const user = this.getUserFromId(from)
    user.name = from

    if (channel.match(/^[&#\!]/)) {
      user.room = channel
    } else {
      user.room = null
    }
    return user
  }

  kick(channel, client, message) {
    return this.#client.emit('raw', {
      command: 'KICK',
      nick: process.env.HUBOT_IRC_NICK,
      args: [ channel, client, message ]
    })
  }

  command(command, ...strings) {
    return this.#client.send(command, ...strings)
  }

  checkCanStart() {
    if (!this.robot.config.nick) {
      throw new Error("HUBOT_IRC_NICK is not defined try: export HUBOT_IRC_NICK='mybot'")
    } else if (!this.robot.config.rooms) {
      throw new Error("HUBOT_IRC_ROOMS is not defined try: export HUBOT_IRC_ROOMS='#myroom'")
    } else if (!this.robot.config.server) {
      throw new Error("HUBOT_IRC_SERVER is not defined: try: export HUBOT_IRC_SERVER='irc.myserver.com'")
    }
  }

  static unfloodProtection(unflood) {
    return (unflood === 'true') || !isNaN(parseInt(unflood))
  }

  static unfloodProtectionDelay(unflood) {
    const unfloodProtection = IrcAdapter.unfloodProtection(unflood)
    const unfloodValue = parseInt(unflood) || 1000

    if (unfloodProtection) {
      return unfloodValue
    } else {
      return 0
    }
  }

  run() {
    this.checkCanStart()
    if (this.robot.config.nickpass != null) {
      let identify_args = ""

      if (this.robot.config.nickusername != null) {
        identify_args += `${this.robot.config.nickusername} `
      }

      identify_args += `${this.robot.config.nickpass}`

      this.#client.addListener('notice', (from, to, text) => {
        if ((from === 'NickServ') && (text.toLowerCase().indexOf('identify') !== -1)) {
          return this.#client.say('NickServ', `identify ${identify_args}`)
        } else if (this.robot.config.nickpass && (from === 'NickServ') &&
                ((text.indexOf('Password accepted') !== -1) ||
                 (text.indexOf('identified') !== -1))) {
          return Array.from(this.robot.config.rooms).map((room) =>
            this.join(room))
        }
      })
    }

    if (this.robot.config.connectCommand != null) {
        this.#client.addListener('registered', (message) => {
        // The 'registered' event is fired when you are connected to the server
        const strings = this.robot.config.connectCommand.split(" ")
        return this.command(strings.shift(), ...strings)
      })
    }

    this.#client.addListener('names', (channel, nicks) => {
      const result = []
      for (let nick in nicks) {
        result.push(this.createUser(channel, nick))
      }
      return result
    })

    this.#client.addListener('notice', async (from, to, message) => {
      if (!from) { return }

      if (this.robot.config.ignoreUsers.includes(from)) {
        this.robot.logger.info('Ignoring user: %s', from)
        // we'll ignore this message if it's from someone we want to ignore
        return
      }

      this.robot.logger.info(`NOTICE from ${from} to ${to}: ${message}`)

      const user = this.createUser(to, from)
      return await this.receive(new TextMessage(user, message))
    })

    this.#client.addListener('message', async (from, to, message) => {
      if (!from) { return }
      
      if (this.robot.config.nick.toLowerCase() === to.toLowerCase()) {
        // this is a private message, let the 'pm' listener handle it
        return
      }

      if (this.robot.config.ignoreUsers.includes(from)) {
        this.robot.logger.info('Ignoring user: %s', from)
        // we'll ignore this message if it's from someone we want to ignore
        return
      }

      this.robot.logger.debug(`From ${from} to ${to}: ${message}`)

      const user = this.createUser(to, from)
      if (user.room) {
        this.robot.logger.debug(`${to} <${from}> ${message}`)
      } else {
        if (message.indexOf(to) !== 0) {
          message = `${to}: ${message}`
        }
        this.robot.logger.debug(`msg <${from}> ${message}`)
      }

      return await this.receive(new TextMessage(user, message))
    })

    this.#client.addListener('action', async (from, to, message) => {
      this.robot.logger.debug(` * From ${from} to ${to}: ${message}`)

      if (this.robot.config.ignoreUsers.includes(from)) {
        this.robot.logger.info('Ignoring user: %s', from)
        // we'll ignore this message if it's from someone we want to ignore
        return
      }

      const user = this.createUser(to, from)
      if (user.room) {
        this.robot.logger.debug(`${to} * ${from} ${message}`)
      } else {
        this.robot.logger.debug(`msg <${from}> ${message}`)
      }

      return await this.receive(new TextMessage(user, message))
    })

    this.#client.addListener('error', message => this.robot.logger.error('ERROR: %s: %s', message.command, message.args.join(' ')))

    this.#client.addListener('pm', async (nick, message) => {
      this.robot.logger.info('Got private message from %s: %s', nick, message)

      if (this.robot.config.isPrivate) {
        return
      }

      if (this.robot.config.ignoreUsers.includes(nick)) {
        this.robot.logger.info('Ignoring user: %s', nick)
        // we'll ignore this message if it's from someone we want to ignore
        return
      }

      const nameLength = this.robot.config.nick.length
      if (message.slice(0, nameLength).toLowerCase() !== this.robot.config.nick.toLowerCase()) {
        message = `${this.robot.config.nick} ${message}`
      }

      return await this.receive(new TextMessage({reply_to: nick, name: nick}, message))
    })

    this.#client.addListener('join', async (channel, who) => {
      this.robot.logger.info('%s has joined %s', who, channel)
      const user = this.createUser(channel, who)
      user.room = channel
      return await this.receive(new EnterMessage(user))
    })

    this.#client.addListener('part', async (channel, who, reason) => {
      this.robot.logger.info('%s has left %s: %s', who, channel, reason)
      const user = this.createUser('', who)
      user.room = channel
      const msg = new LeaveMessage(user)
      msg.text = reason
      return await this.receive(msg)
    })

    this.#client.addListener('quit', async (who, reason, channels) => {
      this.robot.logger.info('%s has quit: %s (%s)', who, channels, reason)
      const result = []
      for (let ch of Array.from(channels)) {
        const user = this.createUser('', who)
        user.room = ch
        const msg = new LeaveMessage(user)
        msg.text = reason
        result.push(this.receive(msg))
      }
      return await Promise.all(result)
    })

    this.#client.addListener('kick', (channel, who, _by, reason) => this.robot.logger.info('%s was kicked from %s by %s: %s', who, channel, _by, reason))

    this.#client.addListener('invite', (channel, from) => {
      this.robot.logger.info('%s invited you to join %s', from, channel)

      if (this.robot.config.ignoreUsers.includes(from)) {
        this.robot.logger.info('Ignoring user: %s', from)
        // we'll ignore this message if it's from someone we want to ignore
        return
      }
      
      if (!this.robot.config.isPrivate || !this.robot.config.shouldIgnoreInvite) {
        return this.#client.join(channel)
      }
    })

    return this.emit("connected")
  }

  #getTargetFromEnvelope(envelope) {
    let target = envelope?.room ?? envelope.user?.room
    return target
  }
}
export {
    IrcAdapter,
    IrcResponse
}
export default IrcAdapter