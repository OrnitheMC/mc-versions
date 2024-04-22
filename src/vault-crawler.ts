#!/usr/bin/env -S deno run -A
// noinspection JSUnusedGlobalSymbols

import { CheerioCrawler, Dataset, sleep } from 'npm:crawlee@3.8.2'
import { omni2mcvMap } from "./compare-omniarchive.ts";

const versionTypeMap = new Map()
const crawler = new CheerioCrawler({
    async requestHandler ({request, $, enqueueLinks, log}){
        const title = $('title').text()
        log.info(`Title of ${request.loadedUrl} is '${title}'`)

        await Dataset.pushData({ title, url: request.loadedUrl })

        const versions = $('a').get()
            .map(el => {
                const link = $(el).attr('href')
                if (link && verifyExtension(link)) {
                    const desc =$(el.next!).text().trim()
                    const descArr = desc.split(/\s+/)
                    return [link!, descArr];
                }
            })
            .filter(Boolean)

        const versionMap = new Map()
        versions.forEach(version => {
            const link = version![0]
            const date = version![1][0]
            const time = version![1][1]
            const size = version![1][2]

            versionMap.set(version![0], version![1])
            return log.info(`Found version: ${link} uploaded on ${date} at ${time} with a size of ${size} bytes`)
        })

        const versionType = title.match(/(?<=\/archive\/java\/(client|server)-)[a-z]*(?=\/)/)

        const tempMap = versionTypeMap.get(versionType)
        if (tempMap) {
            versionTypeMap.set(versionType, new Map([...tempMap, ...versionMap]))
        } else {
            versionTypeMap.set(versionType, versionMap)
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

console.log(`Found ${versionTypeMap.size} version types`)

await Deno.writeTextFile("versionMap.json", JSON.stringify(versionTypeMap))

function verifyExtension(link: string) {
    return link.endsWith('.jar') || link.endsWith('.zip') && link.includes('server-classic')
}