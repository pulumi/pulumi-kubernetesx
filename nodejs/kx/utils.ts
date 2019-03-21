import * as pulumi from "@pulumi/pulumi";
import * as path from "path";

// Returns the object if it is not undefined, otherwise, the defaultValue.
export function objOrDefault(
    obj: pulumi.Input<any>,
    defaultValue: pulumi.Input<any>,
) {
    return Object.is(obj, undefined) ? defaultValue : obj;
}

// Generates a random string.
export function randomString(length: number) {
    return Math.round((Math.pow(36, length + 1) - Math.random() * Math.pow(36, length))).toString(36).slice(1);
}

// Trim a string to a given length, if it exceeds it.
export function trimString(s: string, length: number): string {
    return s.length > length ? s.substring(0, length) : s;
}

// Create a DNS RFC 1123 string from a given filepath string.
export function createDnsString(filepath: string): string {
    let name = path.parse(filepath).name;

    // replace any char that is not alphanumeric or '-'.
    name = name.replace(/[^0-9a-zA-Z-]/g, '');

    // replace any starting or ending char that is not alphanumeric.
    name = name.replace(/^[^a-zA-Z0-9]*|[^a-zA-Z0-9]*$/g, '');

    // return string with max length of 63 chars.
    return trimString(name, 63);
}
