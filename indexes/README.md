# indexes/ — your local catalogs

Ships **empty on purpose**: out of the box, the hook and MCP server rely on
the model's own knowledge plus web search. Drop `*.json` catalog files here
to add the fast local tier — every adapter (hook, MCP server, CLI, eval)
loads all of them.

To enable the example catalog of 189 famous named problems:

```
cp examples/problems.json indexes/
```

The real win is a catalog of vocabulary the model *cannot* know — your
team's coined terms and named failure modes. Entry format and the
build-your-own recipe are in the top-level README.
