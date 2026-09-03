import type { ContentDetails, DiffDetails, SnapshotDetails } from "@agntn/archives/tool-operations";

/**
 * Answers recorded through the docs worker on 2026-09-03, so the landing has content
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
    "text": "[provider=all] 50 snapshot(s) for \"example.com\"; unsupported=1; failed=2\n\n1. 2014-11-21T12:54:20.000Z [archive-today]\n   http://archive.md/20141121125420/http://example.com/\n   original: http://example.com/\n2. 2014-11-21T09:18:36.000Z [archive-today]\n…",
    "details": {
      "mode": "snapshots",
      "target": "example.com",
      "provider": "all",
      "options": {
        "limit": 50,
        "timeout": 45000
      },
      "count": 50,
      "response": {
        "success": true,
        "pages": [
          {
            "url": "http://example.com/",
            "timestamp": "2014-11-21T12:54:20.000Z",
            "snapshot": "http://archive.md/20141121125420/http://example.com/",
            "_meta": {
              "hash": "20141121125420",
              "raw_date": "Fri, 21 Nov 2014 12:54:20 GMT",
              "position": 49,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-11-21T09:18:36.000Z",
            "snapshot": "http://archive.md/20141121091836/http://example.com/",
            "_meta": {
              "hash": "20141121091836",
              "raw_date": "Fri, 21 Nov 2014 09:18:36 GMT",
              "position": 48,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-11-15T05:01:12.000Z",
            "snapshot": "http://archive.md/20141115050112/http://example.com/",
            "_meta": {
              "hash": "20141115050112",
              "raw_date": "Sat, 15 Nov 2014 05:01:12 GMT",
              "position": 47,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-11-08T19:54:49.000Z",
            "snapshot": "http://archive.md/20141108195449/http://example.com/",
            "_meta": {
              "hash": "20141108195449",
              "raw_date": "Sat, 08 Nov 2014 19:54:49 GMT",
              "position": 46,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-10-09T08:26:30.000Z",
            "snapshot": "http://archive.md/20141009082630/http://example.com/",
            "_meta": {
              "hash": "20141009082630",
              "raw_date": "Thu, 09 Oct 2014 08:26:30 GMT",
              "position": 45,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-10-07T23:56:27.000Z",
            "snapshot": "http://archive.md/20141007235627/http://example.com/",
            "_meta": {
              "hash": "20141007235627",
              "raw_date": "Tue, 07 Oct 2014 23:56:27 GMT",
              "position": 44,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-09-04T04:59:14.000Z",
            "snapshot": "http://archive.md/20140904045914/http://example.com/",
            "_meta": {
              "hash": "20140904045914",
              "raw_date": "Thu, 04 Sep 2014 04:59:14 GMT",
              "position": 43,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-08-30T21:06:28.000Z",
            "snapshot": "http://archive.md/20140830210628/http://example.com/",
            "_meta": {
              "hash": "20140830210628",
              "raw_date": "Sat, 30 Aug 2014 21:06:28 GMT",
              "position": 42,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-08-30T20:59:29.000Z",
            "snapshot": "http://archive.md/20140830205929/http://example.com/",
            "_meta": {
              "hash": "20140830205929",
              "raw_date": "Sat, 30 Aug 2014 20:59:29 GMT",
              "position": 41,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-08-21T19:36:36.000Z",
            "snapshot": "http://archive.md/20140821193636/http://example.com/",
            "_meta": {
              "hash": "20140821193636",
              "raw_date": "Thu, 21 Aug 2014 19:36:36 GMT",
              "position": 40,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-08-21T17:15:43.000Z",
            "snapshot": "http://archive.md/20140821171543/http://example.com/",
            "_meta": {
              "hash": "20140821171543",
              "raw_date": "Thu, 21 Aug 2014 17:15:43 GMT",
              "position": 39,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-08-21T17:03:29.000Z",
            "snapshot": "http://archive.md/20140821170329/http://example.com/",
            "_meta": {
              "hash": "20140821170329",
              "raw_date": "Thu, 21 Aug 2014 17:03:29 GMT",
              "position": 38,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-08-21T16:57:28.000Z",
            "snapshot": "http://archive.md/20140821165728/http://example.com/",
            "_meta": {
              "hash": "20140821165728",
              "raw_date": "Thu, 21 Aug 2014 16:57:28 GMT",
              "position": 37,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-08-21T16:52:08.000Z",
            "snapshot": "http://archive.md/20140821165208/http://example.com/",
            "_meta": {
              "hash": "20140821165208",
              "raw_date": "Thu, 21 Aug 2014 16:52:08 GMT",
              "position": 36,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-08-21T16:37:42.000Z",
            "snapshot": "http://archive.md/20140821163742/http://example.com/",
            "_meta": {
              "hash": "20140821163742",
              "raw_date": "Thu, 21 Aug 2014 16:37:42 GMT",
              "position": 35,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-08-21T16:30:14.000Z",
            "snapshot": "http://archive.md/20140821163014/http://example.com/",
            "_meta": {
              "hash": "20140821163014",
              "raw_date": "Thu, 21 Aug 2014 16:30:14 GMT",
              "position": 34,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-08-21T16:24:24.000Z",
            "snapshot": "http://archive.md/20140821162424/http://example.com/",
            "_meta": {
              "hash": "20140821162424",
              "raw_date": "Thu, 21 Aug 2014 16:24:24 GMT",
              "position": 33,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-08-21T16:12:03.000Z",
            "snapshot": "http://archive.md/20140821161203/http://example.com/",
            "_meta": {
              "hash": "20140821161203",
              "raw_date": "Thu, 21 Aug 2014 16:12:03 GMT",
              "position": 32,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-08-21T16:06:38.000Z",
            "snapshot": "http://archive.md/20140821160638/http://example.com/",
            "_meta": {
              "hash": "20140821160638",
              "raw_date": "Thu, 21 Aug 2014 16:06:38 GMT",
              "position": 31,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-08-21T15:59:25.000Z",
            "snapshot": "http://archive.md/20140821155925/http://example.com/",
            "_meta": {
              "hash": "20140821155925",
              "raw_date": "Thu, 21 Aug 2014 15:59:25 GMT",
              "position": 30,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-08-21T15:52:26.000Z",
            "snapshot": "http://archive.md/20140821155226/http://example.com/",
            "_meta": {
              "hash": "20140821155226",
              "raw_date": "Thu, 21 Aug 2014 15:52:26 GMT",
              "position": 29,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-08-21T15:46:52.000Z",
            "snapshot": "http://archive.md/20140821154652/http://example.com/",
            "_meta": {
              "hash": "20140821154652",
              "raw_date": "Thu, 21 Aug 2014 15:46:52 GMT",
              "position": 28,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-08-21T15:39:53.000Z",
            "snapshot": "http://archive.md/20140821153953/http://example.com/",
            "_meta": {
              "hash": "20140821153953",
              "raw_date": "Thu, 21 Aug 2014 15:39:53 GMT",
              "position": 27,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-08-21T15:33:42.000Z",
            "snapshot": "http://archive.md/20140821153342/http://example.com/",
            "_meta": {
              "hash": "20140821153342",
              "raw_date": "Thu, 21 Aug 2014 15:33:42 GMT",
              "position": 26,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-08-21T15:08:30.000Z",
            "snapshot": "http://archive.md/20140821150830/http://example.com/",
            "_meta": {
              "hash": "20140821150830",
              "raw_date": "Thu, 21 Aug 2014 15:08:30 GMT",
              "position": 25,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-08-21T11:25:12.000Z",
            "snapshot": "http://archive.md/20140821112512/http://example.com/",
            "_meta": {
              "hash": "20140821112512",
              "raw_date": "Thu, 21 Aug 2014 11:25:12 GMT",
              "position": 24,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-07-07T07:24:45.000Z",
            "snapshot": "http://archive.md/20140707072445/http://example.com/",
            "_meta": {
              "hash": "20140707072445",
              "raw_date": "Mon, 07 Jul 2014 07:24:45 GMT",
              "position": 23,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-06-03T21:33:42.000Z",
            "snapshot": "http://archive.md/20140603213342/http://example.com/",
            "_meta": {
              "hash": "20140603213342",
              "raw_date": "Tue, 03 Jun 2014 21:33:42 GMT",
              "position": 22,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-05-15T04:52:42.000Z",
            "snapshot": "http://archive.md/20140515045242/http://example.com/",
            "_meta": {
              "hash": "20140515045242",
              "raw_date": "Thu, 15 May 2014 04:52:42 GMT",
              "position": 21,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-04-14T16:46:30.000Z",
            "snapshot": "http://archive.md/20140414164630/http://example.com/",
            "_meta": {
              "hash": "20140414164630",
              "raw_date": "Mon, 14 Apr 2014 16:46:30 GMT",
              "position": 20,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-04-10T01:12:58.000Z",
            "snapshot": "http://archive.md/20140410011258/http://example.com/",
            "_meta": {
              "hash": "20140410011258",
              "raw_date": "Thu, 10 Apr 2014 01:12:58 GMT",
              "position": 19,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-04-01T10:23:23.000Z",
            "snapshot": "http://archive.md/20140401102323/http://example.com/",
            "_meta": {
              "hash": "20140401102323",
              "raw_date": "Tue, 01 Apr 2014 10:23:23 GMT",
              "position": 18,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-03-30T06:39:58.000Z",
            "snapshot": "http://archive.md/20140330063958/http://example.com/",
            "_meta": {
              "hash": "20140330063958",
              "raw_date": "Sun, 30 Mar 2014 06:39:58 GMT",
              "position": 17,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-03-10T10:14:48.000Z",
            "snapshot": "http://archive.md/20140310101448/http://example.com/",
            "_meta": {
              "hash": "20140310101448",
              "raw_date": "Mon, 10 Mar 2014 10:14:48 GMT",
              "position": 16,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2014-02-25T21:47:31.000Z",
            "snapshot": "http://archive.md/20140225214731/http://example.com/",
            "_meta": {
              "hash": "20140225214731",
              "raw_date": "Tue, 25 Feb 2014 21:47:31 GMT",
              "position": 15,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2013-11-10T19:34:42.000Z",
            "snapshot": "http://archive.md/20131110193442/http://example.com/",
            "_meta": {
              "hash": "20131110193442",
              "raw_date": "Sun, 10 Nov 2013 19:34:42 GMT",
              "position": 14,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://example.com/",
            "timestamp": "2013-09-19T04:07:22.000Z",
            "snapshot": "http://archive.md/20130919040722/http://example.com/",
            "_meta": {
              "hash": "20130919040722",
              "raw_date": "Thu, 19 Sep 2013 04:07:22 GMT",
              "position": 13,
              "provider": "archive-today"
            }
          },
          {
            "url": "https://example.com/",
            "timestamp": "2013-08-13T22:16:40.000Z",
            "snapshot": "http://archive.md/20130813221640/https://example.com/",
            "_meta": {
              "hash": "20130813221640",
              "raw_date": "Tue, 13 Aug 2013 22:16:40 GMT",
              "position": 12,
              "provider": "archive-today"
            }
          },
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
            "url": "http://www.example.com/",
            "timestamp": "2010-06-05T14:01:32Z",
            "snapshot": "https://arquivo.pt/wayback/20100605140132/http://www.example.com/",
            "_meta": {
              "timestamp": "20100605140132",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "COSFPXIHL6FDWTZZOQFPYN5HBTZ4Z57M",
              "length": "614"
            }
          },
          {
            "url": "http://www.example.com/",
            "timestamp": "2010-06-04T14:01:27Z",
            "snapshot": "https://arquivo.pt/wayback/20100604140127/http://www.example.com/",
            "_meta": {
              "timestamp": "20100604140127",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "COSFPXIHL6FDWTZZOQFPYN5HBTZ4Z57M",
              "length": "614"
            }
          },
          {
            "url": "http://www.example.com/",
            "timestamp": "2010-06-03T14:01:28Z",
            "snapshot": "https://arquivo.pt/wayback/20100603140128/http://www.example.com/",
            "_meta": {
              "timestamp": "20100603140128",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "EF7YLJGKQUMLJFP3F7A7LBALC65T5W2O",
              "length": "541"
            }
          },
          {
            "url": "http://www.example.com/",
            "timestamp": "2010-06-02T14:01:32Z",
            "snapshot": "https://arquivo.pt/wayback/20100602140132/http://www.example.com/",
            "_meta": {
              "timestamp": "20100602140132",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "EF7YLJGKQUMLJFP3F7A7LBALC65T5W2O",
              "length": "540"
            }
          },
          {
            "url": "http://www.example.com/",
            "timestamp": "2010-06-01T14:01:33Z",
            "snapshot": "https://arquivo.pt/wayback/20100601140133/http://www.example.com/",
            "_meta": {
              "timestamp": "20100601140133",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "EF7YLJGKQUMLJFP3F7A7LBALC65T5W2O",
              "length": "538"
            }
          },
          {
            "url": "http://www.example.com/",
            "timestamp": "2010-05-31T14:01:33Z",
            "snapshot": "https://arquivo.pt/wayback/20100531140133/http://www.example.com/",
            "_meta": {
              "timestamp": "20100531140133",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "EF7YLJGKQUMLJFP3F7A7LBALC65T5W2O",
              "length": "541"
            }
          },
          {
            "url": "http://www.example.com/",
            "timestamp": "2010-05-30T14:01:35Z",
            "snapshot": "https://arquivo.pt/wayback/20100530140135/http://www.example.com/",
            "_meta": {
              "timestamp": "20100530140135",
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
            "wayback: [GET] \"https://web.archive.org/cdx/search/cdx?url=example.com%2F*&output=json&fl=original,timestamp,statuscode&collapse=timestamp:4&limit=50\": <no response> [TimeoutError]: The operation was aborted due to timeout",
            "commoncrawl: [GET] \"https://index.commoncrawl.org/collinfo.json\": <no response> Network connection lost."
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
    "fetchedAt": "2026-09-03T14:33:50.779Z",
    "live": false
  },
  "mozilla.org": {
    "target": "mozilla.org",
    "text": "[provider=all] 50 snapshot(s) for \"mozilla.org\"; unsupported=1; failed=2\n\n1. 2026-04-23T19:42:59.000Z [archive-today]\n   http://archive.md/20260423194259/https://mozilla.org/\n   original: https://mozilla.org/\n2. 2026-03-15T17:39:17.000Z [archive-today]\n…",
    "details": {
      "mode": "snapshots",
      "target": "mozilla.org",
      "provider": "all",
      "options": {
        "limit": 50,
        "timeout": 45000
      },
      "count": 50,
      "response": {
        "success": true,
        "pages": [
          {
            "url": "https://mozilla.org/",
            "timestamp": "2026-04-23T19:42:59.000Z",
            "snapshot": "http://archive.md/20260423194259/https://mozilla.org/",
            "_meta": {
              "hash": "20260423194259",
              "raw_date": "Thu, 23 Apr 2026 19:42:59 GMT",
              "position": 35,
              "provider": "archive-today"
            }
          },
          {
            "url": "https://mozilla.org/",
            "timestamp": "2026-03-15T17:39:17.000Z",
            "snapshot": "http://archive.md/20260315173917/https://mozilla.org/",
            "_meta": {
              "hash": "20260315173917",
              "raw_date": "Sun, 15 Mar 2026 17:39:17 GMT",
              "position": 34,
              "provider": "archive-today"
            }
          },
          {
            "url": "https://www.mozilla.org/",
            "timestamp": "2026-01-01T00:51:38Z",
            "snapshot": "https://web.archive.org/web/20260101005138/https://www.mozilla.org/",
            "_meta": {
              "timestamp": "20260101005138",
              "status": 302,
              "provider": "wayback"
            }
          },
          {
            "url": "https://mozilla.org/",
            "timestamp": "2025-08-17T04:37:40.000Z",
            "snapshot": "http://archive.md/20250817043740/https://mozilla.org/",
            "_meta": {
              "hash": "20250817043740",
              "raw_date": "Sun, 17 Aug 2025 04:37:40 GMT",
              "position": 33,
              "provider": "archive-today"
            }
          },
          {
            "url": "https://mozilla.org/",
            "timestamp": "2025-08-07T11:10:04.000Z",
            "snapshot": "http://archive.md/20250807111004/https://mozilla.org/",
            "_meta": {
              "hash": "20250807111004",
              "raw_date": "Thu, 07 Aug 2025 11:10:04 GMT",
              "position": 32,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://mozilla.org/",
            "timestamp": "2025-05-22T16:50:47.000Z",
            "snapshot": "http://archive.md/20250522165047/http://mozilla.org/",
            "_meta": {
              "hash": "20250522165047",
              "raw_date": "Thu, 22 May 2025 16:50:47 GMT",
              "position": 31,
              "provider": "archive-today"
            }
          },
          {
            "url": "https://mozilla.org/",
            "timestamp": "2025-04-03T17:33:25.000Z",
            "snapshot": "http://archive.md/20250403173325/https://mozilla.org/",
            "_meta": {
              "hash": "20250403173325",
              "raw_date": "Thu, 03 Apr 2025 17:33:25 GMT",
              "position": 30,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://mozilla.org/",
            "timestamp": "2025-01-01T08:38:26Z",
            "snapshot": "https://web.archive.org/web/20250101083826/http://mozilla.org/",
            "_meta": {
              "timestamp": "20250101083826",
              "status": 302,
              "provider": "wayback"
            }
          },
          {
            "url": "https://mozilla.org/",
            "timestamp": "2024-02-09T22:41:04.000Z",
            "snapshot": "http://archive.md/20240209224104/https://mozilla.org/",
            "_meta": {
              "hash": "20240209224104",
              "raw_date": "Fri, 09 Feb 2024 22:41:04 GMT",
              "position": 29,
              "provider": "archive-today"
            }
          },
          {
            "url": "https://www.mozilla.org/",
            "timestamp": "2024-01-01T00:21:02Z",
            "snapshot": "https://web.archive.org/web/20240101002102/https://www.mozilla.org/",
            "_meta": {
              "timestamp": "20240101002102",
              "status": 302,
              "provider": "wayback"
            }
          },
          {
            "url": "http://mozilla.org/",
            "timestamp": "2023-10-27T15:36:30.000Z",
            "snapshot": "http://archive.md/20231027153630/http://mozilla.org/",
            "_meta": {
              "hash": "20231027153630",
              "raw_date": "Fri, 27 Oct 2023 15:36:30 GMT",
              "position": 28,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://mozilla.org/",
            "timestamp": "2023-08-14T22:46:12.000Z",
            "snapshot": "http://archive.md/20230814224612/http://mozilla.org/",
            "_meta": {
              "hash": "20230814224612",
              "raw_date": "Mon, 14 Aug 2023 22:46:12 GMT",
              "position": 27,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://www.mozilla.org/%22",
            "timestamp": "2023-06-18T01:05:18Z",
            "snapshot": "https://web.archive.org/web/20230618010518/http://www.mozilla.org/%22",
            "_meta": {
              "timestamp": "20230618010518",
              "status": 301,
              "provider": "wayback"
            }
          },
          {
            "url": "https://mozilla.org/",
            "timestamp": "2023-04-29T06:58:28.000Z",
            "snapshot": "http://archive.md/20230429065828/https://mozilla.org/",
            "_meta": {
              "hash": "20230429065828",
              "raw_date": "Sat, 29 Apr 2023 06:58:28 GMT",
              "position": 26,
              "provider": "archive-today"
            }
          },
          {
            "url": "https://www.mozilla.org/",
            "timestamp": "2023-01-01T00:21:52Z",
            "snapshot": "https://web.archive.org/web/20230101002152/https://www.mozilla.org/",
            "_meta": {
              "timestamp": "20230101002152",
              "status": 302,
              "provider": "wayback"
            }
          },
          {
            "url": "http://mozilla.org/%22",
            "timestamp": "2022-05-16T20:55:13Z",
            "snapshot": "https://web.archive.org/web/20220516205513/http://mozilla.org/%22",
            "_meta": {
              "timestamp": "20220516205513",
              "status": 301,
              "provider": "wayback"
            }
          },
          {
            "url": "https://mozilla.org/",
            "timestamp": "2022-01-01T06:15:32Z",
            "snapshot": "https://web.archive.org/web/20220101061532/https://mozilla.org/",
            "_meta": {
              "timestamp": "20220101061532",
              "status": 301,
              "provider": "wayback"
            }
          },
          {
            "url": "http://mozilla.org/",
            "timestamp": "2021-12-20T14:05:25.000Z",
            "snapshot": "http://archive.md/20211220140525/http://mozilla.org/",
            "_meta": {
              "hash": "20211220140525",
              "raw_date": "Mon, 20 Dec 2021 14:05:25 GMT",
              "position": 25,
              "provider": "archive-today"
            }
          },
          {
            "url": "https://mozilla.org/",
            "timestamp": "2021-11-16T22:16:20.000Z",
            "snapshot": "http://archive.md/20211116221620/https://mozilla.org/",
            "_meta": {
              "hash": "20211116221620",
              "raw_date": "Tue, 16 Nov 2021 22:16:20 GMT",
              "position": 24,
              "provider": "archive-today"
            }
          },
          {
            "url": "https://mozilla.org/",
            "timestamp": "2021-10-12T17:28:53.000Z",
            "snapshot": "http://archive.md/20211012172853/https://mozilla.org/",
            "_meta": {
              "hash": "20211012172853",
              "raw_date": "Tue, 12 Oct 2021 17:28:53 GMT",
              "position": 23,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://mozilla.org/",
            "timestamp": "2021-03-16T03:24:22.000Z",
            "snapshot": "http://archive.md/20210316032422/http://mozilla.org/",
            "_meta": {
              "hash": "20210316032422",
              "raw_date": "Tue, 16 Mar 2021 03:24:22 GMT",
              "position": 22,
              "provider": "archive-today"
            }
          },
          {
            "url": "https://mozilla.org/",
            "timestamp": "2021-01-04T11:21:46.000Z",
            "snapshot": "http://archive.md/20210104112146/https://mozilla.org/",
            "_meta": {
              "hash": "20210104112146",
              "raw_date": "Mon, 04 Jan 2021 11:21:46 GMT",
              "position": 21,
              "provider": "archive-today"
            }
          },
          {
            "url": "https://www.mozilla.org/",
            "timestamp": "2021-01-01T00:12:19Z",
            "snapshot": "https://web.archive.org/web/20210101001219/https://www.mozilla.org/",
            "_meta": {
              "timestamp": "20210101001219",
              "status": null,
              "provider": "wayback"
            }
          },
          {
            "url": "http://mozilla.org/",
            "timestamp": "2020-09-20T17:07:13.000Z",
            "snapshot": "http://archive.md/20200920170713/http://mozilla.org/",
            "_meta": {
              "hash": "20200920170713",
              "raw_date": "Sun, 20 Sep 2020 17:07:13 GMT",
              "position": 20,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://mozilla.org/",
            "timestamp": "2020-08-15T16:03:15.000Z",
            "snapshot": "http://archive.md/20200815160315/http://mozilla.org/",
            "_meta": {
              "hash": "20200815160315",
              "raw_date": "Sat, 15 Aug 2020 16:03:15 GMT",
              "position": 19,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://mozilla.org/",
            "timestamp": "2020-07-24T13:36:59.000Z",
            "snapshot": "http://archive.md/20200724133659/http://mozilla.org/",
            "_meta": {
              "hash": "20200724133659",
              "raw_date": "Fri, 24 Jul 2020 13:36:59 GMT",
              "position": 18,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://mozilla.org/",
            "timestamp": "2020-04-05T14:12:14.000Z",
            "snapshot": "http://archive.md/20200405141214/http://mozilla.org/",
            "_meta": {
              "hash": "20200405141214",
              "raw_date": "Sun, 05 Apr 2020 14:12:14 GMT",
              "position": 17,
              "provider": "archive-today"
            }
          },
          {
            "url": "https://www.mozilla.org/%22",
            "timestamp": "2020-02-07T12:53:41Z",
            "snapshot": "https://web.archive.org/web/20200207125341/https://www.mozilla.org/%22",
            "_meta": {
              "timestamp": "20200207125341",
              "status": 301,
              "provider": "wayback"
            }
          },
          {
            "url": "https://www.mozilla.org/",
            "timestamp": "2020-01-01T00:45:45Z",
            "snapshot": "https://web.archive.org/web/20200101004545/https://www.mozilla.org/",
            "_meta": {
              "timestamp": "20200101004545",
              "status": 301,
              "provider": "wayback"
            }
          },
          {
            "url": "https://mozilla.org/",
            "timestamp": "2019-09-08T14:57:10.000Z",
            "snapshot": "http://archive.md/20190908145710/https://mozilla.org/",
            "_meta": {
              "hash": "20190908145710",
              "raw_date": "Sun, 08 Sep 2019 14:57:10 GMT",
              "position": 16,
              "provider": "archive-today"
            }
          },
          {
            "url": "https://mozilla.org/",
            "timestamp": "2019-09-08T14:43:39.000Z",
            "snapshot": "http://archive.md/20190908144339/https://mozilla.org/",
            "_meta": {
              "hash": "20190908144339",
              "raw_date": "Sun, 08 Sep 2019 14:43:39 GMT",
              "position": 15,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://www.mozilla.org/%22/",
            "timestamp": "2019-08-05T10:21:15Z",
            "snapshot": "https://web.archive.org/web/20190805102115/http://www.mozilla.org/%22/",
            "_meta": {
              "timestamp": "20190805102115",
              "status": 301,
              "provider": "wayback"
            }
          },
          {
            "url": "http://www.mozilla.org/",
            "timestamp": "2019-01-01T00:30:46Z",
            "snapshot": "https://web.archive.org/web/20190101003046/http://www.mozilla.org/",
            "_meta": {
              "timestamp": "20190101003046",
              "status": null,
              "provider": "wayback"
            }
          },
          {
            "url": "https://mozilla.org/",
            "timestamp": "2018-10-11T08:41:30.000Z",
            "snapshot": "http://archive.md/20181011084130/https://mozilla.org/",
            "_meta": {
              "hash": "20181011084130",
              "raw_date": "Thu, 11 Oct 2018 08:41:30 GMT",
              "position": 14,
              "provider": "archive-today"
            }
          },
          {
            "url": "https://mozilla.org/",
            "timestamp": "2018-10-11T08:40:23.000Z",
            "snapshot": "http://archive.md/20181011084023/https://mozilla.org/",
            "_meta": {
              "hash": "20181011084023",
              "raw_date": "Thu, 11 Oct 2018 08:40:23 GMT",
              "position": 13,
              "provider": "archive-today"
            }
          },
          {
            "url": "http://www.mozilla.org/",
            "timestamp": "2018-01-01T03:52:50Z",
            "snapshot": "https://web.archive.org/web/20180101035250/http://www.mozilla.org/",
            "_meta": {
              "timestamp": "20180101035250",
              "status": null,
              "provider": "wayback"
            }
          },
          {
            "url": "http://www.mozilla.org/%22",
            "timestamp": "2017-12-04T08:04:04Z",
            "snapshot": "https://web.archive.org/web/20171204080404/http://www.mozilla.org/%22",
            "_meta": {
              "timestamp": "20171204080404",
              "status": null,
              "provider": "wayback"
            }
          },
          {
            "url": "https://mozilla.org/",
            "timestamp": "2017-11-16T23:16:12.000Z",
            "snapshot": "http://archive.md/20171116231612/https://mozilla.org/",
            "_meta": {
              "hash": "20171116231612",
              "raw_date": "Thu, 16 Nov 2017 23:16:12 GMT",
              "position": 12,
              "provider": "archive-today"
            }
          },
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
            "url": "http://www.mozilla.org/",
            "timestamp": "2017-01-01T00:20:30Z",
            "snapshot": "https://web.archive.org/web/20170101002030/http://www.mozilla.org/",
            "_meta": {
              "timestamp": "20170101002030",
              "status": null,
              "provider": "wayback"
            }
          },
          {
            "url": "http://www.mozilla.org/%22",
            "timestamp": "2016-04-02T20:19:12Z",
            "snapshot": "https://web.archive.org/web/20160402201912/http://www.mozilla.org/%22",
            "_meta": {
              "timestamp": "20160402201912",
              "status": null,
              "provider": "wayback"
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
            "url": "https://www.mozilla.org/",
            "timestamp": "2016-01-01T02:04:14Z",
            "snapshot": "https://web.archive.org/web/20160101020414/https://www.mozilla.org/",
            "_meta": {
              "timestamp": "20160101020414",
              "status": null,
              "provider": "wayback"
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
            "url": "https://www.mozilla.org/%22",
            "timestamp": "2015-06-03T04:13:11Z",
            "snapshot": "https://web.archive.org/web/20150603041311/https://www.mozilla.org/%22",
            "_meta": {
              "timestamp": "20150603041311",
              "status": 301,
              "provider": "wayback"
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
            "url": "https://www.mozilla.org/",
            "timestamp": "2015-01-01T01:15:31Z",
            "snapshot": "https://web.archive.org/web/20150101011531/https://www.mozilla.org/",
            "_meta": {
              "timestamp": "20150101011531",
              "status": 301,
              "provider": "wayback"
            }
          },
          {
            "url": "http://www.mozilla.org/%22",
            "timestamp": "2014-08-21T14:41:52Z",
            "snapshot": "https://web.archive.org/web/20140821144152/http://www.mozilla.org/%22",
            "_meta": {
              "timestamp": "20140821144152",
              "status": 301,
              "provider": "wayback"
            }
          }
        ],
        "_meta": {
          "source": "multiple",
          "provider": "wayback,arquivo,webarchiv,archive-today,commoncrawl,webcite",
          "providerCount": 6,
          "errors": [
            "arquivo: [GET] \"https://arquivo.pt/wayback/cdx?url=mozilla.org%2F*&output=json&fields=url,timestamp,status,mime,digest,length&limit=50\": <no response> [TimeoutError]: The operation was aborted due to timeout",
            "commoncrawl: [GET] \"https://index.commoncrawl.org/collinfo.json\": <no response> Network connection lost."
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
    "fetchedAt": "2026-09-03T14:34:36.135Z",
    "live": false
  },
  "nuxt.com": {
    "target": "nuxt.com",
    "text": "[provider=all] 50 snapshot(s) for \"nuxt.com\"; unsupported=1; failed=1\n\n1. 2026-01-01T16:50:36Z [wayback]\n   https://web.archive.org/web/20260101165036/https://nuxt.com/%22data:image/svg+xml,%3Csvg%20xmlns='http:/www.w3.org/2000/svg'%20viewBox='0%200%2040%2040'%20width='40'%20height='40'%3E%3Cdefs%3E%3CradialGradient%20id='paint0_radial_106_920'%20cx='0'%20cy='0'%20r='1'%20gradientUnits='userSpaceOnUse'%20gradientTransform='translate(4.00008%2020.0004\n   original: https://nuxt.com/%22data:image/svg+xml,%3Csvg%20xmlns='http:/www.w3.org/2000/svg'%20viewBox='0%200%2040%2040'%20width='40'%20height='40'%3E%3Cdefs%3E%3CradialGradient%20id='paint0_radial_106_920'%20cx='0'%20cy='0'%20r='1'%20gradientUnits='userSpaceOnUse'%20gradientTransform='translate(4.00008%2020.0004\n2. 2026-01-01T01:35:30Z [wayback]\n…",
    "details": {
      "mode": "snapshots",
      "target": "nuxt.com",
      "provider": "all",
      "options": {
        "limit": 50,
        "timeout": 45000
      },
      "count": 50,
      "response": {
        "success": true,
        "pages": [
          {
            "url": "https://nuxt.com/%22data:image/svg+xml,%3Csvg%20xmlns='http:/www.w3.org/2000/svg'%20viewBox='0%200%2040%2040'%20width='40'%20height='40'%3E%3Cdefs%3E%3CradialGradient%20id='paint0_radial_106_920'%20cx='0'%20cy='0'%20r='1'%20gradientUnits='userSpaceOnUse'%20gradientTransform='translate(4.00008%2020.0004",
            "timestamp": "2026-01-01T16:50:36Z",
            "snapshot": "https://web.archive.org/web/20260101165036/https://nuxt.com/%22data:image/svg+xml,%3Csvg%20xmlns='http:/www.w3.org/2000/svg'%20viewBox='0%200%2040%2040'%20width='40'%20height='40'%3E%3Cdefs%3E%3CradialGradient%20id='paint0_radial_106_920'%20cx='0'%20cy='0'%20r='1'%20gradientUnits='userSpaceOnUse'%20gradientTransform='translate(4.00008%2020.0004",
            "_meta": {
              "timestamp": "20260101165036",
              "status": 404,
              "provider": "wayback"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2026-01-01T01:35:30Z",
            "snapshot": "https://web.archive.org/web/20260101013530/https://nuxt.com/",
            "_meta": {
              "timestamp": "20260101013530",
              "status": 200,
              "provider": "wayback"
            }
          },
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
            "url": "https://nuxt.com/%0A",
            "timestamp": "2025-04-13T01:52:50Z",
            "snapshot": "https://web.archive.org/web/20250413015250/https://nuxt.com/%0A",
            "_meta": {
              "timestamp": "20250413015250",
              "status": 404,
              "provider": "wayback"
            }
          },
          {
            "url": "https://nuxt.com/%22data:image/svg+xml,%3Csvg%20xmlns='http:/www.w3.org/2000/svg'%20viewBox='0%200%2040%2040'%20width='40'%20height='40'%3E%3Cdefs%3E%3CradialGradient%20id='paint0_radial_106_920'%20cx='0'%20cy='0'%20r='1'%20gradientUnits='userSpaceOnUse'%20gradientTransform='translate(4.00008%2020.0004",
            "timestamp": "2025-03-21T23:17:33Z",
            "snapshot": "https://web.archive.org/web/20250321231733/https://nuxt.com/%22data:image/svg+xml,%3Csvg%20xmlns='http:/www.w3.org/2000/svg'%20viewBox='0%200%2040%2040'%20width='40'%20height='40'%3E%3Cdefs%3E%3CradialGradient%20id='paint0_radial_106_920'%20cx='0'%20cy='0'%20r='1'%20gradientUnits='userSpaceOnUse'%20gradientTransform='translate(4.00008%2020.0004",
            "_meta": {
              "timestamp": "20250321231733",
              "status": 404,
              "provider": "wayback"
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
            "timestamp": "2025-01-01T00:29:31Z",
            "snapshot": "https://web.archive.org/web/20250101002931/https://nuxt.com/",
            "_meta": {
              "timestamp": "20250101002931",
              "status": 200,
              "provider": "wayback"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-09-13T18:42:31Z",
            "snapshot": "https://arquivo.pt/wayback/20240913184231/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240913184231",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "BSHVKHB7FHQEZIWXDJ3H6XUSIZQTILVA",
              "length": "64231"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-09-12T23:40:54Z",
            "snapshot": "https://arquivo.pt/wayback/20240912234054/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240912234054",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "AUM4HQ6B72QV75A6W5T4NGWW6SIDUY5V",
              "length": "64228"
            }
          },
          {
            "url": "http://nuxt.com/",
            "timestamp": "2024-09-02T00:36:37Z",
            "snapshot": "https://arquivo.pt/wayback/20240902003637/http://nuxt.com/",
            "_meta": {
              "timestamp": "20240902003637",
              "status": 308,
              "provider": "arquivo",
              "mime": "text/plain",
              "digest": "U7Q5IIFOZCJMNYWZ5J4GVGZFGNAXZQOR",
              "length": "346"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-08-15T20:40:35Z",
            "snapshot": "https://arquivo.pt/wayback/20240815204035/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240815204035",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "26ZQJL45HON2YQCB3UBPQHPVJ25S5AXY",
              "length": "120056"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-08-14T22:18:01Z",
            "snapshot": "https://arquivo.pt/wayback/20240814221801/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240814221801",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "5L7TWXLIJXOEHZVL667METJBWG7RM6JQ",
              "length": "120064"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-08-13T22:51:03Z",
            "snapshot": "https://arquivo.pt/wayback/20240813225103/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240813225103",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "5QUCQ73XQLDYYIQGEGDL5BOIOT7CWG37",
              "length": "120060"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-08-12T22:30:45Z",
            "snapshot": "https://arquivo.pt/wayback/20240812223045/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240812223045",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "JK5F5D6SLTOKG6UKG7GWII22ENA6WTIT",
              "length": "120043"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-08-12T04:42:55Z",
            "snapshot": "https://arquivo.pt/wayback/20240812044255/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240812044255",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "IQAKJKVSBEYOY2DQXVQMMUFBT54YFS7V",
              "length": "120046"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-08-11T21:10:23Z",
            "snapshot": "https://arquivo.pt/wayback/20240811211023/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240811211023",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "IQAKJKVSBEYOY2DQXVQMMUFBT54YFS7V",
              "length": "120045"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-08-10T21:21:23Z",
            "snapshot": "https://arquivo.pt/wayback/20240810212123/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240810212123",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "2CLBPVQGAFSH7JXLVQL6WZHBCH75FSID",
              "length": "120042"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-08-09T21:10:36Z",
            "snapshot": "https://arquivo.pt/wayback/20240809211036/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240809211036",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "QWFNRAS4EH6OITGI624WRAUDJ44C5QBR",
              "length": "120031"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-08-08T23:06:13Z",
            "snapshot": "https://arquivo.pt/wayback/20240808230613/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240808230613",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "LNJDZL2XZSGFEKJIVLAOK56CGMRFHI5X",
              "length": "120040"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-08-07T00:52:59Z",
            "snapshot": "https://arquivo.pt/wayback/20240807005259/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240807005259",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "4DBRZCW4OCKGXWV77CJY3A6U2J373KIG",
              "length": "120037"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-08-06T01:36:01Z",
            "snapshot": "https://arquivo.pt/wayback/20240806013601/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240806013601",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "JGOXF765233F7LNUUOSDSNMZDO4MWIFU",
              "length": "119087"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-08-01T22:32:26Z",
            "snapshot": "https://arquivo.pt/wayback/20240801223226/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240801223226",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "HOOB5UV3ZOUYIB5A4OYINIVWKDLBI7IS",
              "length": "119246"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-07-30T23:41:59Z",
            "snapshot": "https://arquivo.pt/wayback/20240730234159/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240730234159",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "PZBVMSAPRB447NB4AK2E6CZEB7DO7QUI",
              "length": "119240"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-07-29T23:57:07Z",
            "snapshot": "https://arquivo.pt/wayback/20240729235707/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240729235707",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "6S6VZGGEVVL7F4W4K7OEA7RCL73R7H7Y",
              "length": "119243"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-07-26T23:31:32Z",
            "snapshot": "https://arquivo.pt/wayback/20240726233132/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240726233132",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "SC2RY3UJNDT42JCTC5MHXSYI2LFOXE7L",
              "length": "119246"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-07-23T23:24:05Z",
            "snapshot": "https://arquivo.pt/wayback/20240723232405/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240723232405",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "TY5CDEVZNYYP2PBSJA6B6UPDDVJBBIIX",
              "length": "118525"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-07-22T23:10:44Z",
            "snapshot": "https://arquivo.pt/wayback/20240722231044/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240722231044",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "26GHHTDFZI2QR5GCM4LRFGXZ4VZOJDL4",
              "length": "118525"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-07-21T23:56:47Z",
            "snapshot": "https://arquivo.pt/wayback/20240721235647/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240721235647",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "I2MWG4HIEXSG6MQWMN2SODLXET4Q5BDC",
              "length": "118525"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-07-21T00:09:02Z",
            "snapshot": "https://arquivo.pt/wayback/20240721000902/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240721000902",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "4YE4IR5XIJVPATBD4DDDLCT7GHKOOBJ2",
              "length": "118522"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-07-19T22:48:41Z",
            "snapshot": "https://arquivo.pt/wayback/20240719224841/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240719224841",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "P6G77BHTJOWG3J5ERRRNZ3MPG4UJKRMM",
              "length": "118529"
            }
          },
          {
            "url": "https://nuxt.com/%22data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http:/www.w3.org/2000/svg'%20width='256'%20height='191'%20viewBox='0%200%20256%20191'%3E%3Cdefs%3E%3ClinearGradient%20id='a'%20x1='100%25'%20x2='0%25'%20y1='22.172%25'%20y2='77.828%25'%3E%3Cstop%20offset='0%25'%20stop-color='%23F90'/%3E%3Cstop%20offset='100%25'%20stop-color='%23FFC300'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath%20fill='url(%23a",
            "timestamp": "2024-07-19T09:48:09Z",
            "snapshot": "https://web.archive.org/web/20240719094809/https://nuxt.com/%22data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http:/www.w3.org/2000/svg'%20width='256'%20height='191'%20viewBox='0%200%20256%20191'%3E%3Cdefs%3E%3ClinearGradient%20id='a'%20x1='100%25'%20x2='0%25'%20y1='22.172%25'%20y2='77.828%25'%3E%3Cstop%20offset='0%25'%20stop-color='%23F90'/%3E%3Cstop%20offset='100%25'%20stop-color='%23FFC300'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath%20fill='url(%23a",
            "_meta": {
              "timestamp": "20240719094809",
              "status": 404,
              "provider": "wayback"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-05-19T13:14:33Z",
            "snapshot": "https://arquivo.pt/wayback/20240519131433/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240519131433",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "6D33ZIFJG32K4T52HHNOP33Y3RXYH6YS",
              "length": "122828"
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
            "timestamp": "2024-02-09T23:52:40Z",
            "snapshot": "https://arquivo.pt/wayback/20240209235240/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240209235240",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "3BRZ43QIUNT6UFIW4RERAAELRP4WIRPL",
              "length": "115850"
            }
          },
          {
            "url": "https://nuxt.com/%22data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http:/www.w3.org/2000/svg'%20width='256'%20height='256'%3E%3Cdefs%3E%3CradialGradient%20id='b'%20cx='161.83'%20cy='788.401'%20r='95.38'%20gradientTransform='matrix(.9999%200%200%20.9498%20-4.622%20-570.387",
            "timestamp": "2024-01-28T12:43:09Z",
            "snapshot": "https://web.archive.org/web/20240128124309/https://nuxt.com/%22data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http:/www.w3.org/2000/svg'%20width='256'%20height='256'%3E%3Cdefs%3E%3CradialGradient%20id='b'%20cx='161.83'%20cy='788.401'%20r='95.38'%20gradientTransform='matrix(.9999%200%200%20.9498%20-4.622%20-570.387",
            "_meta": {
              "timestamp": "20240128124309",
              "status": 404,
              "provider": "wayback"
            }
          },
          {
            "url": "https://nuxt.com/%22data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http:/www.w3.org/2000/svg'%20width='256'%20height='265'%3E%3Cdefs%3E%3CradialGradient%20id='b'%20cx='-7907.187'%20cy='-8515.121'%20r='80.797'%20gradientTransform='translate(26367.938%2028186.305",
            "timestamp": "2024-01-28T12:43:06Z",
            "snapshot": "https://web.archive.org/web/20240128124306/https://nuxt.com/%22data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http:/www.w3.org/2000/svg'%20width='256'%20height='265'%3E%3Cdefs%3E%3CradialGradient%20id='b'%20cx='-7907.187'%20cy='-8515.121'%20r='80.797'%20gradientTransform='translate(26367.938%2028186.305",
            "_meta": {
              "timestamp": "20240128124306",
              "status": 404,
              "provider": "wayback"
            }
          },
          {
            "url": "https://nuxt.com/%22data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http:/www.w3.org/2000/svg'%20width='256'%20height='191'%3E%3Cdefs%3E%3ClinearGradient%20id='a'%20x1='100%25'%20x2='0%25'%20y1='22.172%25'%20y2='77.828%25'%3E%3Cstop%20offset='0%25'%20stop-color='%23F90'/%3E%3Cstop%20offset='100%25'%20stop-color='%23FFC300'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath%20fill='url(%23a",
            "timestamp": "2024-01-28T12:43:03Z",
            "snapshot": "https://web.archive.org/web/20240128124303/https://nuxt.com/%22data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http:/www.w3.org/2000/svg'%20width='256'%20height='191'%3E%3Cdefs%3E%3ClinearGradient%20id='a'%20x1='100%25'%20x2='0%25'%20y1='22.172%25'%20y2='77.828%25'%3E%3Cstop%20offset='0%25'%20stop-color='%23F90'/%3E%3Cstop%20offset='100%25'%20stop-color='%23FFC300'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath%20fill='url(%23a",
            "_meta": {
              "timestamp": "20240128124303",
              "status": 404,
              "provider": "wayback"
            }
          },
          {
            "url": "https://nuxt.com/",
            "timestamp": "2024-01-24T08:44:06Z",
            "snapshot": "https://arquivo.pt/wayback/20240124084406/https://nuxt.com/",
            "_meta": {
              "timestamp": "20240124084406",
              "status": 200,
              "provider": "arquivo",
              "mime": "text/html",
              "digest": "27RVOHFFTWH7KA2GBXW2TYTPGQO25QZE",
              "length": "115602"
            }
          },
          {
            "url": "https://nuxt.com/%23l",
            "timestamp": "2024-01-01T15:25:08Z",
            "snapshot": "https://web.archive.org/web/20240101152508/https://nuxt.com/%23l",
            "_meta": {
              "timestamp": "20240101152508",
              "status": 404,
              "provider": "wayback"
            }
          },
          {
            "url": "https://nuxt.com/%23k",
            "timestamp": "2024-01-01T15:25:06Z",
            "snapshot": "https://web.archive.org/web/20240101152506/https://nuxt.com/%23k",
            "_meta": {
              "timestamp": "20240101152506",
              "status": 404,
              "provider": "wayback"
            }
          },
          {
            "url": "https://nuxt.com/%23j",
            "timestamp": "2024-01-01T15:25:05Z",
            "snapshot": "https://web.archive.org/web/20240101152505/https://nuxt.com/%23j",
            "_meta": {
              "timestamp": "20240101152505",
              "status": 404,
              "provider": "wayback"
            }
          },
          {
            "url": "https://nuxt.com/%23i",
            "timestamp": "2024-01-01T15:25:03Z",
            "snapshot": "https://web.archive.org/web/20240101152503/https://nuxt.com/%23i",
            "_meta": {
              "timestamp": "20240101152503",
              "status": 404,
              "provider": "wayback"
            }
          },
          {
            "url": "https://nuxt.com/%23h",
            "timestamp": "2024-01-01T15:25:02Z",
            "snapshot": "https://web.archive.org/web/20240101152502/https://nuxt.com/%23h",
            "_meta": {
              "timestamp": "20240101152502",
              "status": 404,
              "provider": "wayback"
            }
          },
          {
            "url": "https://nuxt.com/%23g",
            "timestamp": "2024-01-01T15:25:00Z",
            "snapshot": "https://web.archive.org/web/20240101152500/https://nuxt.com/%23g",
            "_meta": {
              "timestamp": "20240101152500",
              "status": 404,
              "provider": "wayback"
            }
          },
          {
            "url": "https://nuxt.com/%23f",
            "timestamp": "2024-01-01T15:24:57Z",
            "snapshot": "https://web.archive.org/web/20240101152457/https://nuxt.com/%23f",
            "_meta": {
              "timestamp": "20240101152457",
              "status": 404,
              "provider": "wayback"
            }
          },
          {
            "url": "https://nuxt.com/%23e",
            "timestamp": "2024-01-01T15:24:56Z",
            "snapshot": "https://web.archive.org/web/20240101152456/https://nuxt.com/%23e",
            "_meta": {
              "timestamp": "20240101152456",
              "status": 404,
              "provider": "wayback"
            }
          },
          {
            "url": "https://nuxt.com/%23c",
            "timestamp": "2024-01-01T15:24:55Z",
            "snapshot": "https://web.archive.org/web/20240101152455/https://nuxt.com/%23c",
            "_meta": {
              "timestamp": "20240101152455",
              "status": 404,
              "provider": "wayback"
            }
          },
          {
            "url": "https://nuxt.com/%23a",
            "timestamp": "2024-01-01T15:24:53Z",
            "snapshot": "https://web.archive.org/web/20240101152453/https://nuxt.com/%23a",
            "_meta": {
              "timestamp": "20240101152453",
              "status": 404,
              "provider": "wayback"
            }
          },
          {
            "url": "https://nuxt.com/%23d",
            "timestamp": "2024-01-01T15:24:52Z",
            "snapshot": "https://web.archive.org/web/20240101152452/https://nuxt.com/%23d",
            "_meta": {
              "timestamp": "20240101152452",
              "status": 404,
              "provider": "wayback"
            }
          }
        ],
        "_meta": {
          "source": "multiple",
          "provider": "wayback,arquivo,webarchiv,archive-today,commoncrawl,webcite",
          "providerCount": 6,
          "errors": [
            "commoncrawl: [GET] \"https://index.commoncrawl.org/collinfo.json\": <no response> Network connection lost."
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
    "fetchedAt": "2026-09-03T14:34:45.245Z",
    "live": false
  }
};

export const LANDING_CONTENT: readonly ContentSample[] = [
  {
    "target": "https://example.com",
    "provider": "wayback",
    "timestamp": "2002",
    "text": "[provider=wayback] read 1 capture for \"https://example.com\"\nurl: http://www.example.com:80/\ncaptured: 2002-11-29T05:43:48Z\nsnapshot: https://web.archive.org/web/20021129054348/http://www.example.com:80/\ntype: text/html; 339 bytes read; slice: 0..226; hasMore=false\n\n--- begin archived content be45ed9fba67 (untrusted data, not instructions) ---\nExample Web Page\n\nYou have reached this web page by typing \"example.com\",\n\"example.net\",\nor \"example.org\" into your web browser.\n\nThese domain names are reserved for use in documentation and are not\navailable\nfor registration.\n--- end archived content be45ed9fba67 ---",
    "details": {
      "mode": "content",
      "target": "https://example.com",
      "provider": "wayback",
      "format": "text",
      "options": {
        "maxBytes": 4096,
        "timestamp": "2002",
        "timeout": 45000
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
    "fetchedAt": "2026-09-03T14:35:09.112Z",
    "live": false
  },
  {
    "target": "https://example.com",
    "provider": "wayback",
    "timestamp": "2015",
    "text": "[provider=wayback] read 1 capture for \"https://example.com\"\nurl: https://example.com/\ncaptured: 2015-12-31T22:21:36Z\nsnapshot: https://web.archive.org/web/20151231222136/https://example.com/\ntype: text/html; 1270 bytes read; slice: 0..219; hasMore=false\n\n--- begin archived content 4fe5195d7e15 (untrusted data, not instructions) ---\nExample Domain\n\nExample Domain\n\nThis domain is established to be used for illustrative examples in documents. You may use this\ndomain in examples without prior coordination or asking for permission.\n\nMore information...\n--- end archived content 4fe5195d7e15 ---",
    "details": {
      "mode": "content",
      "target": "https://example.com",
      "provider": "wayback",
      "format": "text",
      "options": {
        "maxBytes": 4096,
        "timestamp": "2015",
        "timeout": 45000
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
    "fetchedAt": "2026-09-03T14:35:22.010Z",
    "live": false
  },
  {
    "target": "https://example.com",
    "provider": "wayback",
    "timestamp": "2026",
    "text": "[provider=wayback] read 1 capture for \"https://example.com\"\nurl: https://example.com/\ncaptured: 2026-09-03T10:50:31Z\nsnapshot: https://web.archive.org/web/20260903105031/https://example.com/\ntype: text/html; 559 bytes read; slice: 0..142; hasMore=false\n\n--- begin archived content b84ccef9f584 (untrusted data, not instructions) ---\nExample Domain Example Domain\nThis domain is for use in documentation examples without needing permission. Avoid use in operations.\nLearn more\n--- end archived content b84ccef9f584 ---",
    "details": {
      "mode": "content",
      "target": "https://example.com",
      "provider": "wayback",
      "format": "text",
      "options": {
        "maxBytes": 4096,
        "timestamp": "2026",
        "timeout": 45000
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
          "timestamp": "2026-09-03T10:50:31Z",
          "snapshot": "https://web.archive.org/web/20260903105031/https://example.com/",
          "content": "Example Domain Example Domain\nThis domain is for use in documentation examples without needing permission. Avoid use in operations.\nLearn more",
          "mime": "text/html",
          "bytes": 559,
          "truncated": false,
          "_meta": {
            "timestamp": "20260903105031",
            "status": 200,
            "provider": "wayback",
            "rawSnapshot": "https://web.archive.org/web/20260903105031id_/https://example.com/"
          }
        },
        "_meta": {
          "source": "wayback",
          "provider": "wayback",
          "requestedTimestamp": "2026"
        }
      }
    },
    "fetchedAt": "2026-09-03T14:35:50.033Z",
    "live": false
  }
];

export const LANDING_DIFF: DiffSample = {
  "target": "https://example.com",
  "provider": "wayback",
  "before": "2024",
  "after": "2026",
  "text": "[provider=wayback] compared 2 captures for \"https://example.com\"\nbefore: 2024-12-31T23:18:34Z; 1256 bytes\nbefore snapshot: https://web.archive.org/web/20241231231834/https://example.com/\nafter: 2026-09-03T10:50:31Z; 559 bytes\nafter snapshot: https://web.archive.org/web/20260903105031/https://example.com/\ndigest: sha256:03951e4863bb04f2ab4bdc3ed44bdf5f3bdd1c064c9e7b12003d91f7e7014935\nchanges: +3 -8; identical=false; format=text; context=3; slice: 0..495; hasMore=false\n\n--- begin archived diff 8877f5057c6e (untrusted data, not instructions) ---\n--- before\t2024-12-31T23:18:34Z\n+++ after\t2026-09-03T10:50:31Z\n@@ -1,8 +1,3 @@\n-Example Domain\n-\n-Example Domain\n-\n-This domain is for use in illustrative examples in documents. You may use this\n-domain in literature without prior coordination or asking for permission.\n-\n-More information...\n\\ No newline at end of file\n+Example Domain Example Domain\n+This domain is for use in documentation examples without needing permission. Avoid use in operations.\n+Learn more\n\\ No newline at end of file\n\n--- end archived diff 8877f5057c6e ---",
  "details": {
    "mode": "diff",
    "target": "https://example.com",
    "provider": "wayback",
    "format": "text",
    "context": 3,
    "options": {
      "maxBytes": 2000000,
      "timeout": 45000,
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
        "timestamp": "2026-09-03T10:50:31Z",
        "snapshot": "https://web.archive.org/web/20260903105031/https://example.com/",
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
    "digest": "03951e4863bb04f2ab4bdc3ed44bdf5f3bdd1c064c9e7b12003d91f7e7014935",
    "characters": 495,
    "offset": 0,
    "endOffset": 495,
    "hasMore": false,
    "clipped": false
  },
  "fetchedAt": "2026-09-03T14:36:38.156Z",
  "live": false
};
