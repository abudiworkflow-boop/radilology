---
title: radreport-org-developers
source: radreport
category: report-template
system: chest
modality: ct
---

#### RSNA No Longer Publishing New Templates

RadReport templates are intended to provide examples of best practices for diagnostic reporting. Users of RadReport are welcome to download the published templates and to create templates for their personal use. As of December 2022, RSNA is not currently reviewing submitted reporting templates or publishing new templates on [RadReport.org](https://radreport.org/).

RSNA is currently working with the ACR to create structured content that can be more easily adopted into the reporting practice. RadElement Common Data Elements (CDEs) are sets of questions and allowable answers pertaining to a specific reporting use case. CDEs can be applied to clinical practice, research, and performance improvement initiatives in radiology. Learn more about CDEs at [RadElement.org](https://www.radelement.org/)

×

All Templates

TLAP Endorsed Only

**Advanced Search**

## Application Programming Interface (API)

* * *

### General Information

The **Radreport.org** site provides an API to aid developers in accessing structured report templates. The API provides a REST interface, which responds with JSON.

* * *

#### Available Templates

Lists Templates available in the RSNA Reporting Template Library. The values labeled as id can be used as a id input parameter value for the Details query.

`GET https://api3.rsna.org/radreport/v1/templates`

The cited URI responds to a HTTP GET request and supports the following parameters...

- specialty (two character value, multiple values supported with , delimiter, no default value)
- organization (alphabetic value, multiple values supported with , delimiter, no default value)
- language (Data to sort on. title, created, language, etc.)
- approved (boolean, default false)
- search (alphabetic value, no default value)
- sort (Data to sort on. title, created, language, etc.)
- order (asc or desc)
- page (numeric value, no default)
- limit (numeric value, default to return all templates)

##### Examples

- [https://api3.rsna.org/radreport/v1/templates?specialty=CH,CT](https://api3.rsna.org/radreport/v1/templates?specialty=CH,CT)
- [https://api3.rsna.org/radreport/v1/templates?organization=rsna,acr](https://api3.rsna.org/radreport/v1/templates?organization=rsna,acr)
- [https://api3.rsna.org/radreport/v1/templates?language=fr,de](https://api3.rsna.org/radreport/v1/templates?language=fr,de)
- [https://api3.rsna.org/radreport/v1/templates?approved=true](https://api3.rsna.org/radreport/v1/templates?approved=true)
- [https://api3.rsna.org/radreport/v1/templates?search=chest](https://api3.rsna.org/radreport/v1/templates?search=chest)
- [https://api3.rsna.org/radreport/v1/templates?sort=created&order=desc](https://api3.rsna.org/radreport/v1/templates?sort=created&order=desc)
- [https://api3.rsna.org/radreport/v1/templates?limit=5&page=5](https://api3.rsna.org/radreport/v1/templates?limit=5&page=5)

* * *

#### Template Details

Responds with the actual template data from the RSNA Reporting Template Library.

`GET https://api3.rsna.org/radreport/v1/templates/{id}/details?{version}`

The cited URI responds to a HTTP GET request and supports the following parameters...

- id (numeric value. Id's can be found in return of templates query)
- version (time stamp of previous version of template. Version time stamps can be found in return of template details query)

##### Example

- [https://api3.rsna.org/radreport/v1/templates/details/144?version=2011-10-21%2000:00:00](https://api3.rsna.org/radreport/v1/templates/144/details?version=2011-10-21%2000:00:00)

* * *

#### Subspecialty

Lists specialties that have been mapped to individual templates. The values labeled as code can be used as a specialty input parameter value for the Available Templates query.

`GET https://api3.rsna.org/radreport/v1/subspecialty/`

The cited URI responds to a HTTP GET request Results are ordered by the name field in ASC order and is formatted as JSON.

* * *

#### Organizations

Lists organizations that have been mapped to individual templates. The values labeled as code can be used as a org input parameter value for the Available Templates query.

`GET https://api3.rsna.org/radreport/v1/organization`

Results are ordered by the name field in ASC order and is formatted as JSON.

* * *

#### Language

Lists languages in use on individual templates. The values labeled as code can be used as a language input parameter value for the Available Templates query.

`GET https://api3.rsna.org/radreport/v1/language`

The cited URI responds to a HTTP GET request Results are ordered by the lang field in ASC order and is formatted as JSON.