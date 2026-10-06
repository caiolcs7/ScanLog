# ScanLog

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React, TypeScript, Vite, IndexedDB/Dexie, ExcelJS, PWA, ZXing-C++ WASM. These follow the user's recommended architecture. GitHub Pages deployment, no backend.

## Users

Warehouse workers walking between shelves, operating with one hand, sometimes wearing gloves. Desktop operators with USB/Bluetooth keyboard scanners.

## Product Purpose

Read an address once and associate subsequent product scans automatically, then export a professional Excel report with exactly Código do Produto and Endereço.

## Operating Context

Intermittent connectivity, small industrial Data Matrix labels, quick repetitive work. Fixed address is default; paired scanning supports both orders. Persist every accepted operation. No invented inventory data.

## Capabilities and Constraints

Sessions, editing, batch address changes, undo/restore, local backup, image and HID input, configurable parsing, duplicate review, offline export and safe PWA updates. Camera capabilities vary by device and require field validation.

## Brand Commitments

Industrial, modern, clean, minimal, highly legible; no gradients or generic dashboard styling. Portuguese UI. Very visible active address. System font stack explicitly allowed by the brief.

## Evidence on Hand

User supplied specification with examples ITPFPHM510ESAI4, ITPRCSEM03AI4, ITARSRM003AI4, R01A1C03DP02, R01A1C04DP02, R14B77, R14B077. These belong only in documented test fixtures, never seeded into real sessions.

## Open Decisions

Confirmed on 2026-09-14: products use varied prefixes, including IT, ITCP, MPC and STPC, and GS1 Data Matrix labels encode the product under AI 251 followed by AI 37. Location labels encode a site prefix followed by `R<rua>A<andar>C<coluna><lado>P<prateleira>`, for example `A1;R02A1C01EP02`. The default has no product-prefix whitelist; complete location shapes take precedence. Manual records also support the explicit values `SEM CODIGO` and `VAZIO`. Product name: ScanLog (renamed from Leitor de Almoxarifado on 2026-10-06).

## Product Principles

Camera capture defaults to one reading per button press (5-second timeout); continuous capture remains an explicit persisted option. Both use the actual reticle crop. Changing the active address requires confirmation in fixed and paired modes. Correct association before automation. Fast repeated operations. Local processing. Recoverable changes. Honest validation evidence.

## Accessibility & Inclusion

44px minimum frequent touch targets, clear focus, labeled controls, adequate contrast, non-color feedback and reduced-motion support.
