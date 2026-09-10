
import { BaseFeature } from './feature/base/BaseFeature'
import { TestFeature } from './feature/test/TestFeature'



const FEATURE_CLASS: Record<string, typeof BaseFeature> = {
   test: TestFeature,

}


// Per-feature plugin DEFINITIONS (voxgig/plugin `Definition` values), from
// the model's active plugin groups. A feature that takes a `plugins` option
// (secrets over sekreto) reads its own entry; a feature with no plugins has
// none. Named imports above make each definition statically reachable, so
// an SDK carries exactly the plugin modules its model selects — the same
// leanness the old side-effect registry imports bought, without a registry.
const FEATURE_PLUGINS: Record<string, any[]> = {
  
}


class Config {

  makeFeature(this: any, fn: string) {
    const fc = FEATURE_CLASS[fn]
    const fi = new fc()
    // TODO: errors etc
    return fi
  }

  // False for a feature added at runtime via options.extend (station's
  // adopt path) - the constructor uses this to skip makeFeature for names
  // no generated class backs.
  hasFeature(this: any, fn: string) {
    return null != FEATURE_CLASS[fn]
  }


  main = {
    name: 'RepoManager',
        slug: "repo_manager",
    version: "0.0.1",
    target: "ts",

  }


  feature = {
     test:     {
      "options": {
        "active": false
      },
      "transport": "base"
    },

  }


  options = {
    base: "http://localhost:50500",

    headers: {
      "content-type": "application/json"
    },

    entity: {
      
      inbox: {
      },

    }
  }


  entity = {
    "inbox": {
      "fields": [
        {
          "name": "actor",
          "type": "`$STRING`"
        },
        {
          "name": "digest",
          "type": "`$STRING`"
        },
        {
          "name": "first_seen",
          "type": "`$INTEGER`"
        },
        {
          "name": "id",
          "type": "`$STRING`"
        },
        {
          "name": "kind",
          "type": "`$STRING`"
        },
        {
          "name": "org_id",
          "type": "`$STRING`"
        },
        {
          "name": "priority",
          "type": "`$STRING`"
        },
        {
          "name": "repo",
          "type": "`$STRING`"
        },
        {
          "name": "source",
          "type": "`$STRING`"
        },
        {
          "name": "state",
          "type": "`$STRING`"
        },
        {
          "name": "subject_id",
          "type": "`$STRING`"
        },
        {
          "name": "title",
          "type": "`$STRING`"
        },
        {
          "name": "updated_at",
          "type": "`$INTEGER`"
        },
        {
          "name": "url",
          "type": "`$STRING`"
        }
      ],
      "name": "inbox",
      "op": {
        "list": {
          "input": "data",
          "name": "list",
          "points": [
            {
              "args": {},
              "kind": "http",
              "method": "GET",
              "orig": "/api/v1/inbox",
              "segments": [
                {
                  "lit": "api"
                },
                {
                  "lit": "v1"
                },
                {
                  "lit": "inbox"
                }
              ],
              "select": {},
              "transform": {
                "req": "`reqdata`",
                "res": "`body`"
              },
              "parts": [
                "api",
                "v1",
                "inbox"
              ]
            }
          ]
        }
      },
      "relations": {
        "ancestors": []
      }
    }
  }
}


const config = new Config()

export {
  config,
  FEATURE_PLUGINS,
}

