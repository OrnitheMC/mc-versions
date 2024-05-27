#!/usr/bin/env -S deno run -A

import {CheerioCrawler, Dataset, sleep} from 'npm:crawlee@3.8.2'

type OmniVaultDownload = {
    id: string,
    type: VersionType,
    side: Side,
    link: string,
    timeUploaded: Date,
    size: number
}

type Side = "client" | "server"

type OmniVaultVersion = {
    id: string,
    type: VersionType,
    client?: OmniVaultDownload,
    server?: OmniVaultDownload
}

type TypeContainer = {
    type: VersionType
    versions: OmniVaultVersion[]
}

const versionTypes = ["pre-classic", "classic", "indev", "infdev", "alpha", "beta", "release", "april-fools"] as const
type VersionType = typeof versionTypes[number]

type AllOmniVaultVersions = {
    [type in VersionType]: TypeContainer
}

const vaultDownloadMap: Map<Side, Map<string, OmniVaultDownload>> = new Map([['client', new Map()], ['server', new Map()]])
// noinspection JSUnusedGlobalSymbols
const crawler = new CheerioCrawler({
    async requestHandler({request, $, enqueueLinks, log}) {
        const title = $('title').text()
        log.info(`Title of ${request.loadedUrl} is '${title}'`)
        await Dataset.pushData({title, url: request.loadedUrl})

        const match = title.match(/(?<=\/archive\/java\/)((client|server)-[a-z\-]*)|(misc)(?=\/)/g);
        if (match) {
            const versionType = getVersionType(match[0])

            $('a').get().forEach(el => {
                const link = $(el).attr('href')
                if (link && verifyExtension(link)) {
                    let id = link.split('/').at(-1)!.slice(0, -4)
                    if (id.endsWith('-server')) id = id.slice(0, 14)
                    const side = link.includes('server') ? 'server' : 'client'
                    const desc = $(el.next!).text().trim()
                    const descArray = desc.split(/\s+/)
                    const dayArray = descArray[0].split('/').map(Number)
                    const timeArray = descArray[1].split(':').map(Number)
                    const date = new Date(dayArray[2], dayArray[1] - 1, dayArray[0], timeArray[0], timeArray[1], timeArray[2])
                    const size = Number(descArray[2])

                    console.log(`Found version: ${link} uploaded on ${date} with a size of ${size} bytes`)

                    const vaultDownload: OmniVaultDownload = {
                        id,
                        type: versionType,
                        side,
                        link,
                        timeUploaded: date,
                        size
                    }

                    vaultDownloadMap.get(side)!.set(id, vaultDownload)
                }
            })
        }

        await sleep(10)

        await enqueueLinks({
            regexps: [/^https:\/\/vault\.omniarchive\.uk\/archive\/java\/.*index.html$/]
        })
    },

    maxConcurrency: 1,
    maxRequestsPerMinute: 600
})

await crawler.run(['https://vault.omniarchive.uk/archive/java/index.html'])
//await crawler.run(['https://vault.omniarchive.uk/archive/java/client-preclassic/index.html'])

const clientAmount = vaultDownloadMap.get('client')!.size;
const serverAmount = vaultDownloadMap.get('server')!.size;
console.log(`Found ${clientAmount} client downloads and ${serverAmount} server downloads`)
console.log(`Total: ${clientAmount + serverAmount} downloads`)

const typeContainerMap: Map<VersionType, TypeContainer> = new Map()
for (const type of versionTypes) {
    typeContainerMap.set(type, {type, versions: []})
}

vaultDownloadMap.get('client')!.forEach((value, key) => {
    if (vaultDownloadMap.get('server')!.has(key)) {
        const type = value.type
        const server = vaultDownloadMap.get('server')!.get(key)!
        vaultDownloadMap.get('server')!.delete(key)

        const version: OmniVaultVersion = {
            id: key,
            type,
            client: value,
            server
        }

        typeContainerMap.get(type)!.versions.push(version)
    } else {
        const type = value.type

        const version: OmniVaultVersion = {
            id: key,
            type,
            client: value
        }

        typeContainerMap.get(type)!.versions.push(version)
    }
})

vaultDownloadMap.get('server')!.forEach((value, key) => {
    const type = value.type

    const version: OmniVaultVersion = {
        id: key,
        type,
        server: value
    }

    typeContainerMap.get(type)!.versions.push(version)
})

const allVaultVersions = {} as AllOmniVaultVersions

let versionsAmount = 0
typeContainerMap.forEach((value, key) => {
    const amount = value.versions.length
    console.log(`There are ${amount} ${key} versions`)
    versionsAmount += amount

    allVaultVersions[key] = value
})
console.log(`There are ${versionsAmount} total versions`)

const data = JSON.stringify(allVaultVersions, null, 2)
await Deno.writeTextFile("data/omniarchive-vault-versions.json", data)

function verifyExtension(link: string): boolean {
    return link.endsWith('.jar') || link.endsWith('.zip') && link.includes('server-classic')
}

function getVersionType(rawType: string): VersionType {
    if (rawType.includes('misc')) {
        return "release"
    }

    // noinspection SpellCheckingInspection
    switch (rawType.split('-')[1]) {
        case 'preclassic':
            return "pre-classic"
        case 'classic':
            return "classic"
        case 'indev':
            return "indev"
        case 'infdev':
            return "infdev"
        case 'alpha':
            return "alpha"
        case 'beta':
            return "beta"
        case 'release':
            return "release"
        case 'april':
            return "april-fools"
        default:
            throw new Error(`Unknown version type: ${rawType}`)
    }
}
