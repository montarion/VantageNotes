this is a testthis is a test, one]
---
d
restarting on 2026-01-06

here’s the plan:

Vantage notes is a second brain that’s user-programmable, self-hosted, and collaborative.
- list
- [ ] do things
- [ ] do more things
  - [x] even moar


# Second brain
The point of second brain is to offload your first one. Not just when you’re doing research or making  lists, but also by reminding you of chores, what you know about people, and which tasks you’re working on. This happens (mainly) through the [cm6](https://codemirror.net/) code [[InProgress/self/VantageNotes/editor]].

# User-programmable
Of course, if you need more functionality, #VantageNotes allows you to build that yourself. You can query your data using [[InProgress/self/VantageNotes/dataqueries]], and then lua [[InProgress/self/VantageNotes/scripting language]].

# Self-hosted
simply run the docker command and point your reverse proxy towards it.
The backend is run in python, and the frontend is built using deno.

Vantage notes is online-first, with some light metadata caching for offline use.

# Collaborative
For collaboration we use [yjs](https://github.com/yjs/y-codemirror.next). Auhentication happens over OIDC, and you can share singular notes  by using password protected links.

