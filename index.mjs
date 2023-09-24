import Adapter from 'hubot/src/adapter.js'
import Response from 'hubot/src/response.js'
import { TextMessage, EnterMessage, LeaveMessage } from 'hubot/src/message.js'

import Irc from 'irc'
class IrcResponse extends Response {
    sendPrivate(...strings) {
        return this.robot.adapter.sendPrivate(this.envelope, ...strings)
    }
}

class IrcBot extends Adapter {
    constructor(robot) {
        super(robot)
    }
    send(envelope, ...strings) {
        // Use @notice if SEND_NOTICE_MODE is set
        let target
        if (process.env.HUBOT_IRC_SEND_NOTICE_MODE != null) {
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
            if ((typeof this.bot !== "undefined") && (typeof this.bot.say === "function")) {
                result.push(this.bot.say(target, str))
            } else {
                result.push(this.adapter.bot.say(target, str))
            }
        }
        return result
    }

  sendPrivate(envelope, ...strings) {
    // Remove the room from the envelope and send as private message to user

    if (envelope.room) {
      delete envelope.room
    }

    if (envelope.user != null ? envelope.user.room : undefined) {
      delete envelope.user.room
    }

    return this.send(envelope, ...strings)
  }

  topic(envelope, ...strings) {
    const data = strings.join(" / ")
    const channel = envelope.room
    return this.bot.send('TOPIC', channel, data)
  }

  emote(envelope, ...strings) {
    // Use @notice if SEND_NOTICE_MODE is set
    if (process.env.HUBOT_IRC_SEND_NOTICE_MODE != null) {
        return this.notice(envelope, strings)
    }

    const target = this.#getTargetFromEnvelope(envelope)

    if (!target) {
      return this.robot.logger.error("ERROR: Not sure who to send to. envelope=", envelope)
    }

    return strings.map((str) =>
      this.bot.action(target, str))
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

      result.push(this.bot.notice(target, str))
    }
    return result
  }

  reply(envelope, ...strings) {
    return strings.map((str) => this.send(envelope.user, `${envelope.user.name}: ${str}`))
  }

  join(channel) {
    return this.bot.join(channel, function() {
      this.robot.logger.info('joined %s', channel)

      const selfUser = this.getUserFromName(this.robot.name)
      return this.receive(new EnterMessage(selfUser))
    })
  }

  part(channel) {
    return this.bot.part(channel, function() {
      this.robot.logger.info('left %s', channel)

      const selfUser = this.getUserFromName(this.robot.name)
      return this.receive(new LeaveMessage(selfUser))
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
    return this.bot.emit('raw', {
      command: 'KICK',
      nick: process.env.HUBOT_IRC_NICK,
      args: [ channel, client, message ]
    })
  }

  command(command, ...strings) {
    return this.bot.send(command, ...strings)
  }

  checkCanStart() {
    if (!process.env.HUBOT_IRC_NICK && !this.robot.name) {
      throw new Error("HUBOT_IRC_NICK is not defined try: export HUBOT_IRC_NICK='mybot'")
    } else if (!process.env.HUBOT_IRC_ROOMS) {
      throw new Error("HUBOT_IRC_ROOMS is not defined try: export HUBOT_IRC_ROOMS='#myroom'")
    } else if (!process.env.HUBOT_IRC_SERVER) {
      throw new Error("HUBOT_IRC_SERVER is not defined: try: export HUBOT_IRC_SERVER='irc.myserver.com'")
    }
  }

  unfloodProtection(unflood) {
    return (unflood === 'true') || !isNaN(parseInt(unflood))
  }

  unfloodProtectionDelay(unflood) {
    const unfloodProtection = this.unfloodProtection(unflood)
    const unfloodValue = parseInt(unflood) || 1000

    if (unfloodProtection) {
      return unfloodValue
    } else {
      return 0
    }
  }

  run() {
    this.checkCanStart()

    const options = {
      nick:     process.env.HUBOT_IRC_NICK || this.robot.name,
      realName: process.env.HUBOT_IRC_REALNAME,
      port:     process.env.HUBOT_IRC_PORT,
      rooms:    process.env.HUBOT_IRC_ROOMS.split(","),
      ignoreUsers: (process.env.HUBOT_IRC_IGNORE_USERS != null ? process.env.HUBOT_IRC_IGNORE_USERS.split(",") : undefined) || [],
      server:   process.env.HUBOT_IRC_SERVER,
      password: process.env.HUBOT_IRC_PASSWORD,
      nickpass: process.env.HUBOT_IRC_NICKSERV_PASSWORD,
      nickusername: process.env.HUBOT_IRC_NICKSERV_USERNAME,
      connectCommand: process.env.HUBOT_IRC_CONNECT_COMMAND,
      fakessl:  (process.env.HUBOT_IRC_SERVER_FAKE_SSL != null),
      certExpired: (process.env.HUBOT_IRC_SERVER_CERT_EXPIRED != null),
      unflood:  process.env.HUBOT_IRC_UNFLOOD,
      debug:    (process.env.HUBOT_IRC_DEBUG != null),
      usessl:   (process.env.HUBOT_IRC_USESSL != null),
      userName: process.env.HUBOT_IRC_USERNAME,
      usesasl:  (process.env.HUBOT_IRC_USESASL != null)
    }

    const client_options = {
      userName: options.userName,
      realName: options.realName,
      password: options.password,
      debug: options.debug,
      port: options.port,
      stripColors: true,
      secure: options.usessl,
      sasl: options.usesasl,
      selfSigned: options.fakessl,
      certExpired: options.certExpired,
      floodProtection: this.unfloodProtection(options.unflood),
      floodProtectionDelay: this.unfloodProtectionDelay(options.unflood),
      autoRejoin: true,
      retryCount: Infinity
    }

    if (!options.nickpass) {
        client_options['channels'] = options.rooms
    }

    // Override the response to provide a sendPrivate method
    this.robot.Response = IrcResponse

    this.robot.name = options.nick
    const bot = new Irc.Client(options.server, options.nick, client_options)

    if (options.nickpass != null) {
      let identify_args = ""

      if (options.nickusername != null) {
        identify_args += `${options.nickusername} `
      }

      identify_args += `${options.nickpass}`

      bot.addListener('notice', (from, to, text) => {
        if ((from === 'NickServ') && (text.toLowerCase().indexOf('identify') !== -1)) {
          return bot.say('NickServ', `identify ${identify_args}`)
        } else if (options.nickpass && (from === 'NickServ') &&
                ((text.indexOf('Password accepted') !== -1) ||
                 (text.indexOf('identified') !== -1))) {
          return Array.from(options.rooms).map((room) =>
            this.join(room))
        }
      })
    }

    if (options.connectCommand != null) {
      bot.addListener('registered', (message) => {
        // The 'registered' event is fired when you are connected to the server
        const strings = options.connectCommand.split(" ")
        return this.command(strings.shift(), ...strings)
      })
    }

    bot.addListener('names', (channel, nicks) => {
      const result = []
      for (let nick in nicks) {
        result.push(this.createUser(channel, nick))
      }
      return result
    })

    bot.addListener('notice', (from, to, message) => {
      if (!from) { return }

      if (options.ignoreUsers.includes(from)) {
        this.robot.logger.info('Ignoring user: %s', from)
        // we'll ignore this message if it's from someone we want to ignore
        return
      }

      this.robot.logger.info(`NOTICE from ${from} to ${to}: ${message}`)

      const user = this.createUser(to, from)
      return this.receive(new TextMessage(user, message))
    })

    bot.addListener('message', (from, to, message) => {
      if (!from) { return }
      
      if (options.nick.toLowerCase() === to.toLowerCase()) {
        // this is a private message, let the 'pm' listener handle it
        return
      }

      if (options.ignoreUsers.includes(from)) {
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

      return this.receive(new TextMessage(user, message))
    })

    bot.addListener('action', (from, to, message) => {
      this.robot.logger.debug(` * From ${from} to ${to}: ${message}`)

      if (options.ignoreUsers.includes(from)) {
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

      return this.receive(new TextMessage(user, message))
    })

    bot.addListener('error', message => this.robot.logger.error('ERROR: %s: %s', message.command, message.args.join(' ')))

    bot.addListener('pm', (nick, message) => {
      this.robot.logger.info('Got private message from %s: %s', nick, message)

      if (process.env.HUBOT_IRC_PRIVATE) {
        return
      }

      if (options.ignoreUsers.includes(nick)) {
        this.robot.logger.info('Ignoring user: %s', nick)
        // we'll ignore this message if it's from someone we want to ignore
        return
      }

      const nameLength = options.nick.length
      if (message.slice(0, nameLength).toLowerCase() !== options.nick.toLowerCase()) {
        message = `${options.nick} ${message}`
      }

      return this.receive(new TextMessage({reply_to: nick, name: nick}, message))
    })

    bot.addListener('join', (channel, who) => {
      this.robot.logger.info('%s has joined %s', who, channel)
      const user = this.createUser(channel, who)
      user.room = channel
      return this.receive(new EnterMessage(user))
    })

    bot.addListener('part', (channel, who, reason) => {
      this.robot.logger.info('%s has left %s: %s', who, channel, reason)
      const user = this.createUser('', who)
      user.room = channel
      const msg = new LeaveMessage(user)
      msg.text = reason
      return this.receive(msg)
    })

    bot.addListener('quit', (who, reason, channels) => {
      this.robot.logger.info('%s has quit: %s (%s)', who, channels, reason)
      const result = []
      for (let ch of Array.from(channels)) {
        const user = this.createUser('', who)
        user.room = ch
        const msg = new LeaveMessage(user)
        msg.text = reason
        result.push(this.receive(msg))
      }
      return result
    })

    bot.addListener('kick', (channel, who, _by, reason) => this.robot.logger.info('%s was kicked from %s by %s: %s', who, channel, _by, reason))

    bot.addListener('invite', (channel, from) => {
      this.robot.logger.info('%s invited you to join %s', from, channel)

      if (options.ignoreUsers.includes(from)) {
        this.robot.logger.info('Ignoring user: %s', from)
        // we'll ignore this message if it's from someone we want to ignore
        return
      }
      
      if (!process.env.HUBOT_IRC_PRIVATE || !process.env.HUBOT_IRC_IGNOREINVITE) {
        return bot.join(channel)
      }
    })

    this.bot = bot
    return this.emit("connected")
  }

  #getTargetFromEnvelope(envelope) {
    let target = envelope?.room ?? envelope.user?.room
    return target
  }
}

export default {
    use(robot) {
        return new IrcBot(robot)
    }
}