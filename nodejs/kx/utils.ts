import * as pulumi from "@pulumi/pulumi";

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
