# Harbor Config Backend Structure

This project now follows a compact model for Sail config management.

## Admin Navigation

1. Dashboard
2. Users
3. Policy
4. Proxies
5. DNS
6. Simulation
7. Unified Profile

## Core Config Modules

1. Settings
- Log, NTP, TUN inbound, route and DNS finals.

2. Proxies
- Nodes and proxy groups.

3. Policies
- Match conditions and outbound decisions.
- Policy group list and per-group rules.

4. DNS
- DNS servers, DNS rules, DNS final selection.

## Route Mapping

- `/policy`: policy group management
- `/policy/:groupName/rules`: policy rule management inside one group
- Legacy redirects:
  - `/domain-groups` -> `/policy`
  - `/domain-groups/:groupName/domains` -> `/policy/:groupName/rules`
  - `/policy/:groupName/domains` -> `/policy/:groupName/rules`
  - `/routing` -> `/policy`

## Publish Flow

1. Edit structured data in Policy, Proxies, DNS and Settings.
2. Compile to sing-box JSON.
3. Save revision and publish from Unified Profile.
