export default robot => {
    robot.respond(/helo/i, async res => {
        console.log(res.message.user.name)
        await res.reply(`Helo ${res.message.user.name}. I'm ${robot.name}`)
    })
}