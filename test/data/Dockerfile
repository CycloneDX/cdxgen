# image statement
FROM hello-world

# image statement with build stage name
FROM hello-world AS HELLO

# image statement with tag
FROM hello-world:latest

# image statement with sha only
FROM hello-world@sha256:1234567890abcdef

# image statement with tag and sha
FROM hello-world:latest@sha256:1234567890abcdef

# reusing previous build stage as new stage
FROM HELLO as WORLD

# Commented out image statement
# FROM hello-world
