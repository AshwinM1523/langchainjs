import { ParseOracleDocMetadata } from "../web/oracleai.js";
import oracledb from "oracledb";
import { Document } from "@langchain/core/documents";

jest.mock("oracledb");

describe("ParseOracleDocMetadata", () => {
    let parser: ParseOracleDocMetadata;

    beforeEach(() => {
        parser = new ParseOracleDocMetadata();
    });

    test("should parse title and meta tags correctly", () => {
        const htmlString = "<html><title>Sample Title</title><meta name='description' content='Sample Content'></html>";
        parser.parse(htmlString);
        const metadata = parser.getMetadata();
        expect(metadata).toEqual({
            title: "Sample Title",
            description: "Sample Content",
        });
    });

    test("should handle missing meta content gracefully", () => {
        const htmlString = "<html><title>Sample Title</title><meta name='description'></html>";
        parser.parse(htmlString);
        const metadata = parser.getMetadata();
        expect(metadata).toEqual({
            title: "Sample Title",
            description: "N/A",
        });
    });

    test("should handle multiple meta tags", () => {
        const htmlString = "<html><title>Sample Title</title><meta name='description' content='Sample Content'><meta name='author' content='John Doe'></html>";
        parser.parse(htmlString);
        const metadata = parser.getMetadata();
        expect(metadata).toEqual({
            title: "Sample Title",
            description: "Sample Content",
            author: "John Doe",
        });
    });

    test("should handle no title tag", () => {
        const htmlString = "<html><meta name='description' content='Sample Content'></html>";
        parser.parse(htmlString);
        const metadata = parser.getMetadata();
        expect(metadata).toEqual({
            description: "Sample Content",
        });
    });

    test("should handle empty html string", () => {
        const htmlString = "";
        parser.parse(htmlString);
        const metadata = parser.getMetadata();
        expect(metadata).toEqual({});
    });
});


describe("OracleDocLoader - loadFromTable", () => {
let connection: oracledb.Connection;

beforeEach(() => {
connection = {
execute: jest.fn(),
close: jest.fn(),
} as any;
});

afterEach(() => {
jest.clearAllMocks();
});

test("should load documents from a table with valid data", async () => {
const loader = new OracleDocLoader(
connection,
"test_table",
OracleLoadFromType.TABLE,
"TEST_USER",
"CONTENT_COLUMN",
["ID", "AUTHOR"]
);

// Mock the username retrieval
jest.spyOn(loader as any, "getUsername").mockResolvedValue("test_user");

// Mock column metadata retrieval
(connection.execute as jest.Mock)
// First call: retrieving column metadata
.mockResolvedValueOnce({
rows: [
    { COLUMN_NAME: "ID", DATA_TYPE: "NUMBER" },
    { COLUMN_NAME: "AUTHOR", DATA_TYPE: "VARCHAR2" },
    { COLUMN_NAME: "CONTENT_COLUMN", DATA_TYPE: "CLOB" },
],
})
// Second call: retrieving rows from the table
.mockResolvedValueOnce({
rows: [
    {
    MDATA: "<html><title>Document 1</title></html>",
    TEXT: "This is the content of document 1",
    ROWID: "ROWID1",
    ID: 1,
    AUTHOR: "Author 1",
    },
    {
    MDATA: "<html><title>Document 2</title></html>",
    TEXT: "This is the content of document 2",
    ROWID: "ROWID2",
    ID: 2,
    AUTHOR: "Author 2",
    },
],
});

const documents = await loader.load();

expect(connection.execute).toHaveBeenCalledTimes(2); // Two calls: metadata + rows
expect(documents).toHaveLength(2);

// Validate the first document
expect(documents[0].text).toBe("This is the content of document 1");
expect(documents[0].metadata).toEqual({
_oid: expect.any(String),
_rowid: "ROWID1",
ID: 1,
AUTHOR: "Author 1",
title: "Document 1",
});

// Validate the second document
expect(documents[1].text).toBe("This is the content of document 2");
expect(documents[1].metadata).toEqual({
_oid: expect.any(String),
_rowid: "ROWID2",
ID: 2,
AUTHOR: "Author 2",
title: "Document 2",
});
});

test("should throw an error for invalid table name", async () => {
const loader = new OracleDocLoader(
connection,
"invalid_table_name!",
OracleLoadFromType.TABLE,
"TEST_USER",
"CONTENT_COLUMN"
);

await expect(loader.load()).rejects.toThrow("Invalid table name");
});

test("should handle empty results gracefully", async () => {
const loader = new OracleDocLoader(
connection,
"test_table",
OracleLoadFromType.TABLE,
"TEST_USER",
"CONTENT_COLUMN"
);

jest.spyOn(loader as any, "getUsername").mockResolvedValue("test_user");

// Mock no rows in the table
(connection.execute as jest.Mock)
.mockResolvedValueOnce({
rows: [
    { COLUMN_NAME: "ID", DATA_TYPE: "NUMBER" },
    { COLUMN_NAME: "CONTENT_COLUMN", DATA_TYPE: "CLOB" },
],
})
.mockResolvedValueOnce({
rows: [],
});

const documents = await loader.load();

expect(connection.execute).toHaveBeenCalledTimes(2);
expect(documents).toHaveLength(0);
});

test("should handle missing metadata gracefully", async () => {
const loader = new OracleDocLoader(
connection,
"test_table",
OracleLoadFromType.TABLE,
"TEST_USER",
"CONTENT_COLUMN",
["ID"]
);

jest.spyOn(loader as any, "getUsername").mockResolvedValue("test_user");

(connection.execute as jest.Mock)
.mockResolvedValueOnce({
rows: [
    { COLUMN_NAME: "ID", DATA_TYPE: "NUMBER" },
    { COLUMN_NAME: "CONTENT_COLUMN", DATA_TYPE: "CLOB" },
],
})
.mockResolvedValueOnce({
rows: [
    {
    MDATA: null,
    TEXT: "Document content without metadata",
    ROWID: "ROWID3",
    ID: 3,
    },
],
});

const documents = await loader.load();

expect(connection.execute).toHaveBeenCalledTimes(2);
expect(documents).toHaveLength(1);
expect(documents[0].text).toBe("Document content without metadata");
expect(documents[0].metadata).toEqual({
_oid: expect.any(String),
_rowid: "ROWID3",
ID: 3,
});
});
});