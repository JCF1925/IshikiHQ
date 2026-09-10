'use strict';

var token = '%[a-f0-9]{2}';
var multiMatcher = new RegExp('(' + token + ')+', 'gi');
var hexPair = /^[a-f\d]{2}$/i;

function parsePercentByte(input, position) {
  if (input.charCodeAt(position) !== 37 || position + 3 > input.length) {
    return;
  }

  var digits = input.slice(position + 1, position + 3);
  if (!hexPair.test(digits)) {
    return;
  }

  return { byte: parseInt(digits, 16), next: position + 3 };
}

function utf8SequenceLength(byte) {
  if (byte <= 0x7f) return 1;
  if (byte >= 0xc2 && byte <= 0xdf) return 2;
  if (byte >= 0xe0 && byte <= 0xef) return 3;
  if (byte >= 0xf0 && byte <= 0xf4) return 4;
  return 0;
}

function isContinuationByte(byte) {
  return byte >= 0x80 && byte <= 0xbf;
}

function decode(input) {
  try {
    return decodeURIComponent(input);
  } catch (error) {
    var output = '';
    var position = 0;

    while (position < input.length) {
      if (input.charCodeAt(position) !== 37) {
        output += input.charAt(position++);
        continue;
      }

      var firstByte = parsePercentByte(input, position);
      if (!firstByte) {
        output += input.charAt(position++);
        continue;
      }

      var sequenceLength = utf8SequenceLength(firstByte.byte);
      if (sequenceLength === 0) {
        output += input.slice(position, position + 3);
        position += 3;
        continue;
      }

      var end = firstByte.next;
      var validSequence = true;
      for (var index = 1; index < sequenceLength; index++) {
        var nextByte = parsePercentByte(input, end);
        if (!nextByte || !isContinuationByte(nextByte.byte)) {
          validSequence = false;
          break;
        }
        end = nextByte.next;
      }

      if (validSequence) {
        try {
          output += decodeURIComponent(input.slice(position, end));
          position = end;
          continue;
        } catch (error) {
          // Preserve the invalid lead byte and continue scanning.
        }
      }

      output += input.slice(position, position + 3);
      position += 3;
    }

    return output;
  }
}

function customDecodeURIComponent(input) {
  var replaceMap = {
    '%FE%FF': '\uFFFD\uFFFD',
    '%FF%FE': '\uFFFD\uFFFD',
  };

  var match = multiMatcher.exec(input);
  while (match) {
    try {
      replaceMap[match[0]] = decodeURIComponent(match[0]);
    } catch (error) {
      var result = decode(match[0]);
      if (result !== match[0]) {
        replaceMap[match[0]] = result;
      }
    }
    match = multiMatcher.exec(input);
  }

  replaceMap['%C2'] = '\uFFFD';

  Object.keys(replaceMap).forEach(function (key) {
    input = input.replace(new RegExp(key, 'g'), replaceMap[key]);
  });

  return input;
}

module.exports = function decodeUriComponent(encodedURI) {
  if (typeof encodedURI !== 'string') {
    throw new TypeError(
      'Expected `encodedURI` to be of type `string`, got `' +
        typeof encodedURI +
        '`',
    );
  }

  encodedURI = encodedURI.replace(/\+/g, ' ');

  try {
    return decodeURIComponent(encodedURI);
  } catch (error) {
    return customDecodeURIComponent(encodedURI);
  }
};