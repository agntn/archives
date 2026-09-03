import type { ContentDetails, DiffDetails, SnapshotDetails } from "@agntn/archives/tool-operations";

/**
 * Answers recorded through the library on 2026-09-03, so the landing has content
 * before the docs worker answers and when it cannot. Every panel labels a recorded
 * answer as a sample and swaps to a live one as soon as it arrives.
 *
 * Regenerate with the executors in `@agntn/archives/tool-operations`; do not edit by hand.
 */

export interface SnapshotSample {
  readonly target: string;
  readonly text: string;
  readonly details: SnapshotDetails;
  readonly fetchedAt: string;
  readonly live: boolean;
}

export interface ContentSample {
  readonly target: string;
  readonly provider: string;
  readonly timestamp: string;
  readonly text: string;
  readonly details: ContentDetails;
  readonly fetchedAt: string;
  readonly live: boolean;
}

export interface DiffSample {
  readonly target: string;
  readonly provider: string;
  readonly before: string;
  readonly after: string;
  readonly text: string;
  readonly details: DiffDetails;
  readonly fetchedAt: string;
  readonly live: boolean;
}

export const LANDING_TARGETS = ["example.com","mozilla.org","nuxt.com"] as const;

export const LANDING_SNAPSHOTS: Readonly<Record<string, SnapshotSample>> = {
  "example.com": {
    "target": "example.com",
    "text": "[provider=all] 12 snapshot(s) for \"example.com\"; unsupported=1; failed=1\n\n1. 2013-07-31T09:35:06.000Z [archive-today]\n   http://archive.md/20130731093506/https://example.com/\n   original: https://example.com/\n2. 2013-01-17T06:35:49.000Z [archive-today]\n   http://archive.md/20130117063549/http://example.com/\n   original: http://example.com/\n3. 2013-01-01T00:16:12Z [wayback]\n   https://web.archive.org/web/20130101001612/http://user:pass@example.com/\n   original: http://user:pass@example.com/\n4. 2012-12-18T16:34:32.000Z [archive-today]\n   http://archive.md/20121218163432/http://example.com/\n   original: http://example.com/\n5. 2012-07-23T03:06:12.000Z [archive-today]\n   http://archive.md/20120723030612/http://example.com/\n   original: http://example.com/\n6. 2012-05-27T03:08:01.000Z [archive-today]\n   http://archive.md/20120527030801/http://example.com/\n   original: http://example.com/\n7. 2012-01-01T01:25:41Z [wayback]\n   https://web.archive.org/web/20120101012541/http://user:pass@example.com/\n   original: http://user:pass@example.com/\n8. 2011-01-01T00:37:24Z [wayback]\n   https://web.archive.org/web/20110101003724/http://user:pass@example.com/\n   original: http://user:pass@example.com/\n9. 2010-04-19T14:53:03Z [arquivo]\n   https://arquivo.pt/wayback/20100419145303/http://www.example.com/\n   original: http://www.example.com/\n10. 2010-04-16T10:17:39Z [arquivo]\n   https://arquivo.pt/wayback/20100416101739/http://www.example.com/\n   original: http://www.example.com/\n11. 2010-04-13T15:50:35Z [arquivo]\n   https://arquivo.pt/wayback/20100413155035/http://www.example.com/\n   original: http://www.example.com/\n12. 2010-04-12T16:01:53Z [arquivo]\n   https://arquivo.pt/wayback/20100412160153/http://www.example.com/\n   original: http://www.example.com/\n\nUnsupported providers:\n  webcite: WebCite has no list-by-domain API. Existing snapshots can be fetched directly via webcitation.org/<id>; new archives have not been accepted since ~2019.\n\nFailed providers:\n  commoncrawl: [GET] \"https://index.commoncrawl.org/collinfo.json\": <no response> fetch failed",
    "details": {
      "mode": "snapshots",
      "target": "example.com",
      "provider": "all",
      "options": {
        "limit": 12,
        "timeout": 30000
      },
      "count": 12,
      "response": {
        "success": true,
        "pages": [
          {
            "url": "https://example.com/",
            "timestamp": "2013-07-31T09:35:06.000Z",
            "snapshot": "http://archive.md/20130731093506/https://example.com/",
            "_meta": {
              "hash": "20130731093506",
              "raw_date": "Wed, 31 Jul 2013 09:35:06 GMT",
              "position": 11,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2013-01-17T06:35:49.000Z",
            "snapshot": "http://archive.md/20130117063549/http://example.com/",
            "_meta": {
              "hash": "20130117063549",
              "raw_date": "Thu, 17 Jan 2013 06:35:49 GMT",
              "position": 10,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://user:pass@example.com/",
            "timestamp": "2013-01-01T00:16:12Z",
            "snapshot": "https://web.archive.org/web/20130101001612/http://user:pass@example.com/",
            "_meta": {
              "timestamp": "20130101001612",
              "status": 302,
              "provider": "wayback"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2012-12-18T16:34:32.000Z",
            "snapshot": "http://archive.md/20121218163432/http://example.com/",
            "_meta": {
              "hash": "20121218163432",
              "raw_date": "Tue, 18 Dec 2012 16:34:32 GMT",
              "position": 9,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2012-07-23T03:06:12.000Z",
            "snapshot": "http://archive.md/20120723030612/http://example.com/",
            "_meta": {
              "hash": "20120723030612",
              "raw_date": "Mon, 23 Jul 2012 03:06:12 GMT",
              "position": 8,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2012-05-27T03:08:01.000Z",
            "snapshot": "http://archive.md/20120527030801/http://example.com/",
            "_meta": {
              "hash": "20120527030801",
              "raw_date": "Sun, 27 May 2012 03:08:01 GMT",
              "position": 7,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://user:pass@example.com/",
            "timestamp": "2012-01-01T01:25:41Z",
            "snapshot": "https://web.archive.org/web/20120101012541/http://user:pass@example.com/",
            "_meta": {
              "timestamp": "20120101012541",
              "status": 302,
              "provider": "wayback"
            }
          },
          {
            "url": "http://user:pass@example.com/",
            "timestamp": "2011-01-01T00:37:24Z",
            "snapshot": "https://web.archive.org/web/20110101003724/http://user:pass@example.com/",
            "_meta": {
              "timestamp": "20110101003724",
              "status": 200,
              "provider": "wayback"
            }
          },
          {
            "url": "http://www.example.com/",
            "timestamp": "2010-04-19T14:53:03Z",
            "snapshot": "https://arquivo.pt/wayback/20100419145303/http://www.example.com/",
            "_meta": {
              "timestamp": "20100419145303",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "EF7YLJGKQUMLJFP3F7A7LBALC65T5W2O",
              "length": "540"
            }
          },
          {
            "url": "http://www.example.com/",
            "timestamp": "2010-04-16T10:17:39Z",
            "snapshot": "https://arquivo.pt/wayback/20100416101739/http://www.example.com/",
            "_meta": {
              "timestamp": "20100416101739",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "EF7YLJGKQUMLJFP3F7A7LBALC65T5W2O",
              "length": "540"
            }
          },
          {
            "url": "http://www.example.com/",
            "timestamp": "2010-04-13T15:50:35Z",
            "snapshot": "https://arquivo.pt/wayback/20100413155035/http://www.example.com/",
            "_meta": {
              "timestamp": "20100413155035",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "EF7YLJGKQUMLJFP3F7A7LBALC65T5W2O",
              "length": "538"
            }
          },
          {
            "url": "http://www.example.com/",
            "timestamp": "2010-04-12T16:01:53Z",
            "snapshot": "https://arquivo.pt/wayback/20100412160153/http://www.example.com/",
            "_meta": {
              "timestamp": "20100412160153",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "EF7YLJGKQUMLJFP3F7A7LBALC65T5W2O",
              "length": "540"
            }
          }
        ],
        "_meta": {
          "source": "multiple",
          "provider": "wayback,arquivo,webarchiv,archive-today,commoncrawl,webcite",
          "providerCount": 6,
          "errors": [
            "commoncrawl: [GET] \"https://index.commoncrawl.org/collinfo.json\": <no response> fetch failed"
          ],
          "unsupportedProviders": [
            {
              "provider": "webcite",
              "reason": "WebCite has no list-by-domain API. Existing snapshots can be fetched directly via webcitation.org/<id>; new archives have not been accepted since ~2019."
            }
          ]
        }
      }
    },
    "fetchedAt": "2026-09-03T12:00:00Z",
    "live": false
  },
  "mozilla.org": {
    "target": "mozilla.org",
    "text": "[provider=all] 12 snapshot(s) for \"mozilla.org\"; unsupported=1; failed=1\n\n1. 2017-09-14T03:48:32.000Z [archive-today]\n   http://archive.md/20170914034832/http://mozilla.org/\n   original: http://mozilla.org/\n2. 2017-09-04T09:23:15.000Z [archive-today]\n   http://archive.md/20170904092315/http://mozilla.org/\n   original: http://mozilla.org/\n3. 2016-03-02T22:19:05.000Z [archive-today]\n   http://archive.md/20160302221905/https://mozilla.org/\n   original: https://mozilla.org/\n4. 2016-02-16T20:09:15.000Z [archive-today]\n   http://archive.md/20160216200915/https://mozilla.org/\n   original: https://mozilla.org/\n5. 2015-11-19T14:07:16.000Z [archive-today]\n   http://archive.md/20151119140716/http://mozilla.org/\n   original: http://mozilla.org/\n6. 2015-05-20T18:05:45.000Z [archive-today]\n   http://archive.md/20150520180545/http://mozilla.org/\n   original: http://mozilla.org/\n7. 2013-08-30T23:29:50.000Z [archive-today]\n   http://archive.md/20130830232950/https://mozilla.org/\n   original: https://mozilla.org/\n8. 2012-12-05T05:21:39.000Z [archive-today]\n   http://archive.md/20121205052139/http://mozilla.org/\n   original: http://mozilla.org/\n9. 2009-09-26T21:20:19Z [arquivo]\n   https://arquivo.pt/wayback/20090926212019/http://www.mozilla.org/\n   original: http://www.mozilla.org/\n10. 2009-09-25T05:49:06Z [arquivo]\n   https://arquivo.pt/wayback/20090925054906/http://www.mozilla.org/\n   original: http://www.mozilla.org/\n11. 2009-09-19T04:12:55Z [arquivo]\n   https://arquivo.pt/wayback/20090919041255/http://www.mozilla.org/\n   original: http://www.mozilla.org/\n12. 2009-09-12T16:26:22Z [arquivo]\n   https://arquivo.pt/wayback/20090912162622/http://mozilla.org/\n   original: http://mozilla.org/\n\nUnsupported providers:\n  webcite: WebCite has no list-by-domain API. Existing snapshots can be fetched directly via webcitation.org/<id>; new archives have not been accepted since ~2019.\n\nFailed providers:\n  commoncrawl: [GET] \"https://index.commoncrawl.org/collinfo.json\": <no response> fetch failed",
    "details": {
      "mode": "snapshots",
      "target": "mozilla.org",
      "provider": "all",
      "options": {
        "limit": 12,
        "timeout": 40000
      },
      "count": 12,
      "response": {
        "success": true,
        "pages": [
          {
            "url": "http://mozilla.org/",
            "timestamp": "2017-09-14T03:48:32.000Z",
            "snapshot": "http://archive.md/20170914034832/http://mozilla.org/",
            "_meta": {
              "hash": "20170914034832",
              "raw_date": "Thu, 14 Sep 2017 03:48:32 GMT",
              "position": 11,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://mozilla.org/",
            "timestamp": "2017-09-04T09:23:15.000Z",
            "snapshot": "http://archive.md/20170904092315/http://mozilla.org/",
            "_meta": {
              "hash": "20170904092315",
              "raw_date": "Mon, 04 Sep 2017 09:23:15 GMT",
              "position": 10,
              "provider": "archive-today"
            }
          },
          {
            "url": "https://mozilla.org/",
            "timestamp": "2016-03-02T22:19:05.000Z",
            "snapshot": "http://archive.md/20160302221905/https://mozilla.org/",
            "_meta": {
              "hash": "20160302221905",
              "raw_date": "Wed, 02 Mar 2016 22:19:05 GMT",
              "position": 9,
              "provider": "archive-today"
            }
          },
          {
            "url": "https://mozilla.org/",
            "timestamp": "2016-02-16T20:09:15.000Z",
            "snapshot": "http://archive.md/20160216200915/https://mozilla.org/",
            "_meta": {
              "hash": "20160216200915",
              "raw_date": "Tue, 16 Feb 2016 20:09:15 GMT",
              "position": 8,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://mozilla.org/",
            "timestamp": "2015-11-19T14:07:16.000Z",
            "snapshot": "http://archive.md/20151119140716/http://mozilla.org/",
            "_meta": {
              "hash": "20151119140716",
              "raw_date": "Thu, 19 Nov 2015 14:07:16 GMT",
              "position": 7,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://mozilla.org/",
            "timestamp": "2015-05-20T18:05:45.000Z",
            "snapshot": "http://archive.md/20150520180545/http://mozilla.org/",
            "_meta": {
              "hash": "20150520180545",
              "raw_date": "Wed, 20 May 2015 18:05:45 GMT",
              "position": 6,
              "provider": "archive-today"
            }
          },
          {
            "url": "https://mozilla.org/",
            "timestamp": "2013-08-30T23:29:50.000Z",
            "snapshot": "http://archive.md/20130830232950/https://mozilla.org/",
            "_meta": {
              "hash": "20130830232950",
              "raw_date": "Fri, 30 Aug 2013 23:29:50 GMT",
              "position": 5,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://mozilla.org/",
            "timestamp": "2012-12-05T05:21:39.000Z",
            "snapshot": "http://archive.md/20121205052139/http://mozilla.org/",
            "_meta": {
              "hash": "20121205052139",
              "raw_date": "Wed, 05 Dec 2012 05:21:39 GMT",
              "position": 4,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://www.mozilla.org/",
            "timestamp": "2009-09-26T21:20:19Z",
            "snapshot": "https://arquivo.pt/wayback/20090926212019/http://www.mozilla.org/",
            "_meta": {
              "timestamp": "20090926212019",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "SKDOLEP5VCUYXLT7JSSH4Y52IBPHJ6EF",
              "length": "4446"
            }
          },
          {
            "url": "http://www.mozilla.org/",
            "timestamp": "2009-09-25T05:49:06Z",
            "snapshot": "https://arquivo.pt/wayback/20090925054906/http://www.mozilla.org/",
            "_meta": {
              "timestamp": "20090925054906",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "USHPU43SJXL4BPUDVS5EOWIW7TM5OUM5",
              "length": "4429"
            }
          },
          {
            "url": "http://www.mozilla.org/",
            "timestamp": "2009-09-19T04:12:55Z",
            "snapshot": "https://arquivo.pt/wayback/20090919041255/http://www.mozilla.org/",
            "_meta": {
              "timestamp": "20090919041255",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "RBASP2MWEIGBEYEVTCYF4DVQZH5EUV3N",
              "length": "4533"
            }
          },
          {
            "url": "http://mozilla.org/",
            "timestamp": "2009-09-12T16:26:22Z",
            "snapshot": "https://arquivo.pt/wayback/20090912162622/http://mozilla.org/",
            "_meta": {
              "timestamp": "20090912162622",
              "status": 301,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "P3RUZJPWLI5AS2IBJ7VKBO3GHVTAMG4N",
              "length": "607"
            }
          }
        ],
        "_meta": {
          "source": "multiple",
          "provider": "wayback,arquivo,webarchiv,archive-today,commoncrawl,webcite",
          "providerCount": 6,
          "errors": [
            "commoncrawl: [GET] \"https://index.commoncrawl.org/collinfo.json\": <no response> fetch failed"
          ],
          "unsupportedProviders": [
            {
              "provider": "webcite",
              "reason": "WebCite has no list-by-domain API. Existing snapshots can be fetched directly via webcitation.org/<id>; new archives have not been accepted since ~2019."
            }
          ]
        }
      }
    },
    "fetchedAt": "2026-09-03T12:00:00Z",
    "live": false
  },
  "nuxt.com": {
    "target": "nuxt.com",
    "text": "[provider=all] 12 snapshot(s) for \"nuxt.com\"; unsupported=1; failed=1\n\n1. 2025-07-23T06:10:37.000Z [archive-today]\n   http://archive.md/20250723061037/https://nuxt.com/\n   original: https://nuxt.com/\n2. 2025-03-09T15:25:47.000Z [archive-today]\n   http://archive.md/20250309152547/https://nuxt.com/\n   original: https://nuxt.com/\n3. 2025-02-23T16:01:36.000Z [archive-today]\n   http://archive.md/20250223160136/https://nuxt.com/\n   original: https://nuxt.com/\n4. 2024-05-19T09:46:26.000Z [archive-today]\n   http://archive.md/20240519094626/https://nuxt.com/\n   original: https://nuxt.com/\n5. 2023-04-24T03:58:48Z [arquivo]\n   https://arquivo.pt/wayback/20230424035848/https://nuxt.com/\n   original: https://nuxt.com/\n6. 2023-04-23T03:50:16Z [arquivo]\n   https://arquivo.pt/wayback/20230423035016/https://nuxt.com/\n   original: https://nuxt.com/\n7. 2023-04-22T01:35:02Z [arquivo]\n   https://arquivo.pt/wayback/20230422013502/https://nuxt.com/\n   original: https://nuxt.com/\n8. 2023-04-21T02:59:31Z [arquivo]\n   https://arquivo.pt/wayback/20230421025931/https://nuxt.com/\n   original: https://nuxt.com/\n9. 2023-04-19T02:32:04Z [arquivo]\n   https://arquivo.pt/wayback/20230419023204/https://nuxt.com/\n   original: https://nuxt.com/\n10. 2023-04-18T00:55:29Z [arquivo]\n   https://arquivo.pt/wayback/20230418005529/https://nuxt.com/\n   original: https://nuxt.com/\n11. 2023-04-16T01:06:19Z [arquivo]\n   https://arquivo.pt/wayback/20230416010619/https://nuxt.com/\n   original: https://nuxt.com/\n12. 2023-04-15T05:59:51Z [arquivo]\n   https://arquivo.pt/wayback/20230415055951/https://nuxt.com/\n   original: https://nuxt.com/\n\nUnsupported providers:\n  webcite: WebCite has no list-by-domain API. Existing snapshots can be fetched directly via webcitation.org/<id>; new archives have not been accepted since ~2019.\n\nFailed providers:\n  commoncrawl: [GET] \"https://index.commoncrawl.org/collinfo.json\": <no response> fetch failed",
    "details": {
      "mode": "snapshots",
      "target": "nuxt.com",
      "provider": "all",
      "options": {
        "limit": 12,
        "timeout": 40000
      },
      "count": 12,
      "response": {
        "success": true,
        "pages": [
          {
            "url": "https://nuxt.com/",
            "timestamp": "2025-07-23T06:10:37.000Z",
            "snapshot": "http://archive.md/20250723061037/https://nuxt.com/",
            "_meta": {
              "hash": "20250723061037",
              "raw_date": "Wed, 23 Jul 2025 06:10:37 GMT",
              "position": 4,
              "provider": "archive-today"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2025-03-09T15:25:47.000Z",
            "snapshot": "http://archive.md/20250309152547/https://nuxt.com/",
            "_meta": {
              "hash": "20250309152547",
              "raw_date": "Sun, 09 Mar 2025 15:25:47 GMT",
              "position": 3,
              "provider": "archive-today"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2025-02-23T16:01:36.000Z",
            "snapshot": "http://archive.md/20250223160136/https://nuxt.com/",
            "_meta": {
              "hash": "20250223160136",
              "raw_date": "Sun, 23 Feb 2025 16:01:36 GMT",
              "position": 2,
              "provider": "archive-today"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-05-19T09:46:26.000Z",
            "snapshot": "http://archive.md/20240519094626/https://nuxt.com/",
            "_meta": {
              "hash": "20240519094626",
              "raw_date": "Sun, 19 May 2024 09:46:26 GMT",
              "position": 1,
              "provider": "archive-today"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2023-04-24T03:58:48Z",
            "snapshot": "https://arquivo.pt/wayback/20230424035848/https://nuxt.com/",
            "_meta": {
              "timestamp": "20230424035848",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "3VMJ7XZJRBMOFGI3TIQPDBNPCUBI7U3A",
              "length": "157619"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2023-04-23T03:50:16Z",
            "snapshot": "https://arquivo.pt/wayback/20230423035016/https://nuxt.com/",
            "_meta": {
              "timestamp": "20230423035016",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "BKHYWN3BPSNF7OQLGZQBX2LVF7BOSLCT",
              "length": "157584"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2023-04-22T01:35:02Z",
            "snapshot": "https://arquivo.pt/wayback/20230422013502/https://nuxt.com/",
            "_meta": {
              "timestamp": "20230422013502",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "OBS3Y72IFK7FCKY2Z3IPWQPVFS5I4S4K",
              "length": "157518"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2023-04-21T02:59:31Z",
            "snapshot": "https://arquivo.pt/wayback/20230421025931/https://nuxt.com/",
            "_meta": {
              "timestamp": "20230421025931",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "IMA6M72LSE2XPCXSBISLL6S4IQJR6RDW",
              "length": "157692"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2023-04-19T02:32:04Z",
            "snapshot": "https://arquivo.pt/wayback/20230419023204/https://nuxt.com/",
            "_meta": {
              "timestamp": "20230419023204",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "S4H5CVIYWAJOWSAY7R2H46A5LBDQPTDK",
              "length": "157575"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2023-04-18T00:55:29Z",
            "snapshot": "https://arquivo.pt/wayback/20230418005529/https://nuxt.com/",
            "_meta": {
              "timestamp": "20230418005529",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "KKBFYN5YIVVA4AY2Z5ASFHBMIFRUXO23",
              "length": "157535"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2023-04-16T01:06:19Z",
            "snapshot": "https://arquivo.pt/wayback/20230416010619/https://nuxt.com/",
            "_meta": {
              "timestamp": "20230416010619",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "R4M52LCTGVRYBHDJ5XRHCAGXPFKU36H7",
              "length": "156775"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2023-04-15T05:59:51Z",
            "snapshot": "https://arquivo.pt/wayback/20230415055951/https://nuxt.com/",
            "_meta": {
              "timestamp": "20230415055951",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "Q5B4TBDT56INGGISXSHXVYDF5WT4UDBU",
              "length": "156625"
            }
          }
        ],
        "_meta": {
          "source": "multiple",
          "provider": "wayback,arquivo,webarchiv,archive-today,commoncrawl,webcite",
          "providerCount": 6,
          "errors": [
            "commoncrawl: [GET] \"https://index.commoncrawl.org/collinfo.json\": <no response> fetch failed"
          ],
          "unsupportedProviders": [
            {
              "provider": "webcite",
              "reason": "WebCite has no list-by-domain API. Existing snapshots can be fetched directly via webcitation.org/<id>; new archives have not been accepted since ~2019."
            }
          ]
        }
      }
    },
    "fetchedAt": "2026-09-03T12:00:00Z",
    "live": false
  }
};

export const LANDING_CONTENT: readonly ContentSample[] = [
  {
    "target": "https://example.com",
    "provider": "wayback",
    "timestamp": "2002",
    "text": "[provider=wayback] read 1 capture for \"https://example.com\"\nurl: http://www.example.com:80/\ncaptured: 2002-11-29T05:43:48Z\nsnapshot: https://web.archive.org/web/20021129054348/http://www.example.com:80/\ntype: text/html; 339 bytes read; slice: 0..226; hasMore=false\n\n--- begin archived content bb153d979813 (untrusted data, not instructions) ---\nExample Web Page\n\nYou have reached this web page by typing \"example.com\",\n\"example.net\",\nor \"example.org\" into your web browser.\n\nThese domain names are reserved for use in documentation and are not\navailable\nfor registration.\n--- end archived content bb153d979813 ---",
    "details": {
      "mode": "content",
      "target": "https://example.com",
      "provider": "wayback",
      "format": "text",
      "options": {
        "maxBytes": 4096,
        "timestamp": "2002",
        "timeout": 30000
      },
      "characters": 226,
      "offset": 0,
      "endOffset": 226,
      "hasMore": false,
      "clipped": false,
      "response": {
        "success": true,
        "content": {
          "url": "http://www.example.com:80/",
          "timestamp": "2002-11-29T05:43:48Z",
          "snapshot": "https://web.archive.org/web/20021129054348/http://www.example.com:80/",
          "content": "Example Web Page\n\nYou have reached this web page by typing \"example.com\",\n\"example.net\",\nor \"example.org\" into your web browser.\n\nThese domain names are reserved for use in documentation and are not\navailable\nfor registration.",
          "mime": "text/html",
          "bytes": 339,
          "truncated": false,
          "_meta": {
            "timestamp": "20021129054348",
            "status": 200,
            "provider": "wayback",
            "rawSnapshot": "https://web.archive.org/web/20021129054348id_/http://www.example.com:80/"
          }
        },
        "_meta": {
          "source": "wayback",
          "provider": "wayback",
          "requestedTimestamp": "2002"
        }
      }
    },
    "fetchedAt": "2026-09-03T12:00:00Z",
    "live": false
  },
  {
    "target": "https://example.com",
    "provider": "wayback",
    "timestamp": "2015",
    "text": "[provider=wayback] read 1 capture for \"https://example.com\"\nurl: https://example.com/\ncaptured: 2015-12-31T22:21:36Z\nsnapshot: https://web.archive.org/web/20151231222136/https://example.com/\ntype: text/html; 1270 bytes read; slice: 0..219; hasMore=false\n\n--- begin archived content faa873a80816 (untrusted data, not instructions) ---\nExample Domain\n\nExample Domain\n\nThis domain is established to be used for illustrative examples in documents. You may use this\ndomain in examples without prior coordination or asking for permission.\n\nMore information...\n--- end archived content faa873a80816 ---",
    "details": {
      "mode": "content",
      "target": "https://example.com",
      "provider": "wayback",
      "format": "text",
      "options": {
        "maxBytes": 4096,
        "timestamp": "2015",
        "timeout": 30000
      },
      "characters": 219,
      "offset": 0,
      "endOffset": 219,
      "hasMore": false,
      "clipped": false,
      "response": {
        "success": true,
        "content": {
          "url": "https://example.com/",
          "timestamp": "2015-12-31T22:21:36Z",
          "snapshot": "https://web.archive.org/web/20151231222136/https://example.com/",
          "content": "Example Domain\n\nExample Domain\n\nThis domain is established to be used for illustrative examples in documents. You may use this\ndomain in examples without prior coordination or asking for permission.\n\nMore information...",
          "mime": "text/html",
          "bytes": 1270,
          "truncated": false,
          "_meta": {
            "timestamp": "20151231222136",
            "status": 200,
            "provider": "wayback",
            "rawSnapshot": "https://web.archive.org/web/20151231222136id_/https://example.com/"
          }
        },
        "_meta": {
          "source": "wayback",
          "provider": "wayback",
          "requestedTimestamp": "2015"
        }
      }
    },
    "fetchedAt": "2026-09-03T12:00:00Z",
    "live": false
  },
  {
    "target": "https://example.com",
    "provider": "wayback",
    "timestamp": "2026",
    "text": "[provider=wayback] read 1 capture for \"https://example.com\"\nurl: https://example.com/\ncaptured: 2026-09-03T03:05:39Z\nsnapshot: https://web.archive.org/web/20260903030539/https://example.com/\ntype: text/html; 559 bytes read; slice: 0..142; hasMore=false\n\n--- begin archived content b5f91f5d367c (untrusted data, not instructions) ---\nExample Domain Example Domain\nThis domain is for use in documentation examples without needing permission. Avoid use in operations.\nLearn more\n--- end archived content b5f91f5d367c ---",
    "details": {
      "mode": "content",
      "target": "https://example.com",
      "provider": "wayback",
      "format": "text",
      "options": {
        "maxBytes": 4096,
        "timestamp": "2026",
        "timeout": 30000
      },
      "characters": 142,
      "offset": 0,
      "endOffset": 142,
      "hasMore": false,
      "clipped": false,
      "response": {
        "success": true,
        "content": {
          "url": "https://example.com/",
          "timestamp": "2026-09-03T03:05:39Z",
          "snapshot": "https://web.archive.org/web/20260903030539/https://example.com/",
          "content": "Example Domain Example Domain\nThis domain is for use in documentation examples without needing permission. Avoid use in operations.\nLearn more",
          "mime": "text/html",
          "bytes": 559,
          "truncated": false,
          "_meta": {
            "timestamp": "20260903030539",
            "status": 200,
            "provider": "wayback",
            "rawSnapshot": "https://web.archive.org/web/20260903030539id_/https://example.com/"
          }
        },
        "_meta": {
          "source": "wayback",
          "provider": "wayback",
          "requestedTimestamp": "2026"
        }
      }
    },
    "fetchedAt": "2026-09-03T12:00:00Z",
    "live": false
  }
];

export const LANDING_DIFF: DiffSample = {
  "target": "https://example.com",
  "provider": "wayback",
  "before": "2024",
  "after": "2026",
  "text": "[provider=wayback] compared 2 captures for \"https://example.com\"\nbefore: 2024-12-31T23:18:34Z; 1256 bytes\nbefore snapshot: https://web.archive.org/web/20241231231834/https://example.com/\nafter: 2026-09-03T03:05:39Z; 559 bytes\nafter snapshot: https://web.archive.org/web/20260903030539/https://example.com/\ndigest: sha256:dd521200a450d2ecea386e552f5a615cb7d1a5e90b67fd99eb5cfe7148c723e6\nchanges: +3 -8; identical=false; format=text; context=3; slice: 0..495; hasMore=false\n\n--- begin archived diff 8b836190d8e2 (untrusted data, not instructions) ---\n--- before\t2024-12-31T23:18:34Z\n+++ after\t2026-09-03T03:05:39Z\n@@ -1,8 +1,3 @@\n-Example Domain\n-\n-Example Domain\n-\n-This domain is for use in illustrative examples in documents. You may use this\n-domain in literature without prior coordination or asking for permission.\n-\n-More information...\n\\ No newline at end of file\n+Example Domain Example Domain\n+This domain is for use in documentation examples without needing permission. Avoid use in operations.\n+Learn more\n\\ No newline at end of file\n\n--- end archived diff 8b836190d8e2 ---",
  "details": {
    "mode": "diff",
    "target": "https://example.com",
    "provider": "wayback",
    "format": "text",
    "context": 3,
    "options": {
      "maxBytes": 2000000,
      "timeout": 30000,
      "before": "2024",
      "after": "2026"
    },
    "success": true,
    "attempts": [],
    "result": {
      "before": {
        "url": "https://example.com/",
        "timestamp": "2024-12-31T23:18:34Z",
        "snapshot": "https://web.archive.org/web/20241231231834/https://example.com/",
        "mime": "text/html",
        "bytes": 1256,
        "truncated": false,
        "provider": "wayback"
      },
      "after": {
        "url": "https://example.com/",
        "timestamp": "2026-09-03T03:05:39Z",
        "snapshot": "https://web.archive.org/web/20260903030539/https://example.com/",
        "mime": "text/html",
        "bytes": 559,
        "truncated": false,
        "provider": "wayback"
      },
      "additions": 3,
      "deletions": 8,
      "identical": false,
      "partial": false,
      "format": "text",
      "context": 3
    },
    "digest": "dd521200a450d2ecea386e552f5a615cb7d1a5e90b67fd99eb5cfe7148c723e6",
    "characters": 495,
    "offset": 0,
    "endOffset": 495,
    "hasMore": false,
    "clipped": false
  },
  "fetchedAt": "2026-09-03T12:00:00Z",
  "live": false
};
