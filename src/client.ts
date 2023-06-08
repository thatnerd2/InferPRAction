import axios from 'axios'
import fs from 'fs'

export type SourceFilesMap = {
  [key: string]: string
}

export type SarifFileContents = {
  runs: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    results: {[key: string]: any}[]
  }[]
  [key: string]: unknown
}

export function scanSourceFiles(sarif: SarifFileContents): SourceFilesMap {
  const sourceFilesMap: {[key: string]: string} = {}
  for (const run of sarif['runs']) {
    for (const result of run['results']) {
      for (const location of result['locations']) {
        const uri = location.physicalLocation.artifactLocation.uri
        console.log(`URI: ${uri}`)
        const contents = fs
          .readFileSync(location.physicalLocation.artifactLocation.uri)
          .toString()
        sourceFilesMap[uri] = contents
      }
    }
  }
  console.log('Gathered source files:', Object.keys(sourceFilesMap))
  return sourceFilesMap
}

export async function updateSarifWithFixes(
  sarif: SarifFileContents,
  sourceFilesMap: SourceFilesMap
): Promise<SarifFileContents> {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.DPBF_TOKEN}`
  }

  const result = await axios.post(
    'https://deeppromptbugfix-dev.westus2.inference.ml.azure.com/score',
    {
      sarif_file_content: sarif,
      source_files_map: sourceFilesMap
    },
    {headers}
  )
  return JSON.parse(result.data.updated_sarif_file_content)
}

export async function mockUpdateSarifWithFixes(
  sarif: SarifFileContents,
  sourceFilesMap: SourceFilesMap
): Promise<SarifFileContents> {
  // add fix emplacements to sarif myself for each sourceFilesMap
  for (const run of sarif['runs']) {
    for (const result of run['results']) {
      const uri =
        result['locations'][0]['physicalLocation']['artifactLocation']['uri']
      if (!(uri in sourceFilesMap)) {
        continue
      }
      const file_contents = sourceFilesMap[uri]
      const fix_start_line =
        result['locations'][0]['physicalLocation']['region']['startLine']
      const fix_end_line =
        result['locations'][0]['physicalLocation']['region']['endLine'] ||
        fix_start_line
      result['fixes'] = [
        {
          description: {text: 'MESSAGE HERE'},
          artifactChanges: [
            {
              artifactLocation: {
                uri,
                uriBaseId: '%SRCROOT%'
              },
              replacements: [
                {
                  deletedRegion: {
                    startLine: fix_start_line,
                    startColumn: 1,
                    endLine: fix_end_line,
                    endColumn:
                      file_contents.split('\n')[fix_end_line - 1].length
                  },
                  insertedContent: 'FIX HERE'
                }
              ]
            }
          ]
        }
      ]
    }
  }
  return sarif
}
