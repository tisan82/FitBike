# Inspection response integrity

15539 was read through the deployed v21 MCP connector: content types were text/image/image and both PNGs rendered (496×460,390×362). Thus server omission is not reproduced here; another client/runtime may strip images. The actual asset is handlebar controls incorrectly labelled as engine underside/parking surface, so approval is prohibited.

Change: validate actual final response content against declared indices/MIME/PNG signature/source SHA before serialization. Distinguish technical QA, server response pixel delivery, and unverified client display. On missing blocks, return an explicit structured error preserving Job/SHA and fallback access; never regenerate because of transport failure. Storage and signed URL access are recovery paths; server cannot observe images being stripped after sending or run native Vision itself.

Checks: transport negative paths, real PNG decode/pixel identity, independent QA, live connector response. No image status mutation or approval. Rollback: restore Edge Function v21.

Validation: 38 transport/reference tests and real ImageMagick PNG pixel identity test pass; independent reviewer rejected five malformed response variants. Live v21 delivered two images for15539 before changes. No server-side omission reproduced. Storage read failure uses server-owned same-origin signed URL then bounded internal retry. Edge Function v22 deployed: live15539 response types text/image/image, technicalQa/pixelDeliveryQa PASS scoped SERVER_MCP_RESPONSE, clientUNVERIFIED, semanticNOT_EVALUATED. Both actual PNGs rendered; no approval/status mutation.
