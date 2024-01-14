// API Keys
const OPENAI_API_KEY = '';

// Sheet Names
const TRANSACTION_SHEET_NAME = 'Transactions';
const CATEGORY_SHEET_NAME = 'Categories';

// Column Names
const TRANSACTION_ID_COL_NAME = 'Transaction ID';
const ORIGINAL_DESCRIPTION_COL_NAME = 'Full Description';
const DESCRIPTION_COL_NAME = 'Description';
const CATEGORY_COL_NAME = 'Category';
const ACCOUNT_COL_NAME = 'Account';
const AMOUNT_COL_NAME = 'Amount';

const AI_AUTOCAT_COL_NAME = 'AI AutoCat'
const TAGS_COL_NAME = 'Tags'

const DATE_COL_NAME = 'Date';

// Fallback Transaction Category (to be used when we don't know how to categorize a transaction)
const FALLBACK_CATEGORY = "Uncategorized";

// Other Misc Paramaters
const MAX_BATCH_SIZE = 1;

function categorizeUncategorizedTransactions() {
  var uncategorizedTransactions = getTransactionsToCategorize();

  var numTxnsToCategorize = uncategorizedTransactions.length;
  if (numTxnsToCategorize == 0) {
    Logger.log("No uncategorized transactions found");
    return;
  }

  Logger.log("Found " + numTxnsToCategorize + " transactions to categorize");
  Logger.log("Looking for historical similar transactions...");

  var transactionList = []
  for (var i = 0; i < uncategorizedTransactions.length; i++) {
    Logger.log("uncategorizedTransactions:" + uncategorizedTransactions[i]);
    Logger.log("uncategorizedTransactions:" + uncategorizedTransactions[i][1]);
    Logger.log("uncategorizedTransactions:" + uncategorizedTransactions[i][2]);

    // Passing Description and Amount for searching
    var similarTransactions = findSimilarTransactions(uncategorizedTransactions[i][1], uncategorizedTransactions[i][2]);

    transactionList.push({
      'transaction_id': uncategorizedTransactions[i][0],
      'original_description': uncategorizedTransactions[i][1],
      'original_amount'     : uncategorizedTransactions[i][2],
      'previous_transactions': similarTransactions
    });
  }

  Logger.log("Processing this set of transactions and similar transactions with Open AI:");
  Logger.log(transactionList);

  var categoryList = getAllowedCategories();

  var updatedTransactions = lookupDescAndCategory(transactionList, categoryList);

  if (updatedTransactions != null) {
    Logger.log("Open AI returned the following sugested categories and descriptions:");
    Logger.log(updatedTransactions);
    Logger.log("Writing updated transactions into your sheet...");
    writeUpdatedTransactions(updatedTransactions, categoryList);
    Logger.log("Finished updating your sheet!");
  }
}

// Gets all transactions that have an original description but no category set
function getTransactionsToCategorize() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRANSACTION_SHEET_NAME);
  var headers = sheet.getRange("1:1").getValues()[0];

  var txnIDColLetter = getColumnLetterFromColumnHeader(headers, TRANSACTION_ID_COL_NAME);
  var origDescColLetter = getColumnLetterFromColumnHeader(headers, ORIGINAL_DESCRIPTION_COL_NAME);
  var categoryColLetter = getColumnLetterFromColumnHeader(headers, CATEGORY_COL_NAME);
  var amountColLetter = getColumnLetterFromColumnHeader(headers, AMOUNT_COL_NAME);

  var lastColLetter = getColumnLetterFromColumnHeader(headers, headers[headers.length - 1]);

  var queryString = "SELECT " + txnIDColLetter + ", " + origDescColLetter + ", " +  amountColLetter + " WHERE " + origDescColLetter +
                    " is not null AND " + categoryColLetter + " is null LIMIT " + MAX_BATCH_SIZE;

  var uncategorizedTransactions = Utils.gvizQuery(
      SpreadsheetApp.getActiveSpreadsheet().getId(), 
      queryString, 
      TRANSACTION_SHEET_NAME,
      "A:" + lastColLetter
    );

  return uncategorizedTransactions;
}

function findSimilarTransactions(originalDescription, amountToMatch) {
  // Normalize to lowercase
  var matchString = originalDescription.toLowerCase();

  // Remove phone number placeholder
  matchString = matchString.replace('xx', '#');

  // Strip numbers at end
  var descriptionParts = matchString.split('#');
  matchString = descriptionParts[0];

  // Remove unimportant words
  matchString = matchString.replace('direct debit ', '');
  matchString = matchString.replace('direct deposit ', '');
  matchString = matchString.replace('zelle payment from ', '');
  matchString = matchString.replace('bill payment ', '');
  matchString = matchString.replace('dividend received ', '');
  matchString = matchString.replace('debit card purchase ', '');
  matchString = matchString.replace('sq *', '');
  matchString = matchString.replace('sq*', '');
  matchString = matchString.replace('tst *', '');
  matchString = matchString.replace('tst*', '');
  matchString = matchString.replace('in *', '');
  matchString = matchString.replace('in*', '');
  matchString = matchString.replace('tcb *', '');
  matchString = matchString.replace('tcb*', '');
  matchString = matchString.replace('dd *', '');
  matchString = matchString.replace('dd*', '');
  matchString = matchString.replace('py *', '');
  matchString = matchString.replace('py*', '');
  matchString = matchString.replace('p *', '');
  matchString = matchString.replace('pp*', '');
  matchString = matchString.replace('rx *', '');
  matchString = matchString.replace('rx*', '');
  matchString = matchString.replace('intuit *', '');
  matchString = matchString.replace('intuit*', '');
  matchString = matchString.replace('microsoft *', '');
  matchString = matchString.replace('microsoft*', '');

  matchString = matchString.replace('*', ' ');

  // Trim leading & trailing spaces
  matchString = matchString.trim();

  // Remove funky char/letter combinations.  Lets keep just letters.
  stringsOnly = matchString.match(/[a-zA-Z]+/g);
  Logger.log("so:" + stringsOnly); // Or return matchString;
  matchString = stringsOnly.join(' ');
  Logger.log("ms:" +matchString); // Or return matchString;

  // Trim double spaces
  matchString = matchString.replace(/\s+/g, ' ');

  // Grab first 3 words
  var previousTransactionList = [];
  var runningCount =0;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRANSACTION_SHEET_NAME);
  var headers = sheet.getRange("1:1").getValues()[0];

  var descColLetter = getColumnLetterFromColumnHeader(headers, DESCRIPTION_COL_NAME);
  var origDescColLetter = getColumnLetterFromColumnHeader(headers, ORIGINAL_DESCRIPTION_COL_NAME);
  var categoryColLetter = getColumnLetterFromColumnHeader(headers, CATEGORY_COL_NAME);
  var dateColLetter = getColumnLetterFromColumnHeader(headers, DATE_COL_NAME);

  var tagColLetter = getColumnLetterFromColumnHeader(headers, TAGS_COL_NAME);
  var accountColLetter = getColumnLetterFromColumnHeader(headers,ACCOUNT_COL_NAME);
  var amountColLetter = getColumnLetterFromColumnHeader(headers,AMOUNT_COL_NAME);
  var lastColLetter = getColumnLetterFromColumnHeader(headers, headers[headers.length - 1]);

  var descriptionParts = matchString.split(' ');
  var wordLoop = Math.min(3, descriptionParts.length);

  for (var w = 0; w < wordLoop; w++) {
    
    descriptionWord = descriptionParts.slice(w, Math.min(1, descriptionParts.length))
    matchString = descriptionParts.join(' ');

    // Fetch Queries where you match on single word desc.
    var queryString = "SELECT " + descColLetter + ", " + categoryColLetter + ", " + origDescColLetter + ", " + tagColLetter + ", " + accountColLetter + ", " + amountColLetter +
                      " WHERE " + categoryColLetter + " is not null AND (lower(" + 
                      origDescColLetter + ") contains \"" + matchString + "\" OR lower(" + descColLetter +
                      ") contains \"" + matchString + "\") ORDER BY " + dateColLetter +" DESC LIMIT 5";
  
    Logger.log("Looking for previous transactions with query: " + queryString);
    
    var result = Utils.gvizQuery(
        SpreadsheetApp.getActiveSpreadsheet().getId(), 
        queryString, 
        TRANSACTION_SHEET_NAME,
        "A:" + lastColLetter
      );
  

    for (var i = 0; i < result.length; i++) {
      previousTransactionList.push({
        'original_description': result[i][2],
        'updated_description': result[i][0],
        'category': result[i][1],
        'account': result[i][4],
        'tags': result[i][3],
        'amount': result[i][5]
      });
      runningCount += 1;
    }
  }
  // Fetch Queries where you match on exact amount
  // Fetch Queries where you match on single word desc.
  // amountToMatch
  var queryString = "SELECT " + descColLetter + ", " + categoryColLetter + ", " + origDescColLetter + ", " + tagColLetter + ", " + accountColLetter + ", " + amountColLetter + 
                    " WHERE " + categoryColLetter + " is not null AND " + amountColLetter + " = " + amountToMatch + " ORDER BY " + dateColLetter +" DESC LIMIT 5";


  Logger.log("Looking for previous transactions with query: " + queryString);
    
  var result = Utils.gvizQuery(
      SpreadsheetApp.getActiveSpreadsheet().getId(), 
      queryString, 
      TRANSACTION_SHEET_NAME,
      "A:" + lastColLetter
    );

  for (var i = 0; i < result.length; i++) {
    previousTransactionList.push({
      'original_description': result[i][2],
      'updated_description': result[i][0],
      'category': result[i][1],
      'account': result[i][4],
      'tags': result[i][3],
      'amount': result[i][5]
    });
    runningCount += 1;
  }
  Logger.log("Total number of related queries found: " + runningCount);

  return previousTransactionList;
}

function writeUpdatedTransactions(transactionList, categoryList) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Transactions");

  // Get Column Numbers
  var headers = sheet.getRange("1:1").getValues()[0];

  var descriptionColumnLetter = getColumnLetterFromColumnHeader(headers, DESCRIPTION_COL_NAME);
  var categoryColumnLetter = getColumnLetterFromColumnHeader(headers, CATEGORY_COL_NAME);
  var transactionIDColumnLetter = getColumnLetterFromColumnHeader(headers, TRANSACTION_ID_COL_NAME);
  var tagsIDColumnLetter = getColumnLetterFromColumnHeader(headers, TAGS_COL_NAME);

  var openAIFlagColLetter = getColumnLetterFromColumnHeader(headers, AI_AUTOCAT_COL_NAME);
  Logger.log("AI_AUTOCAT_COL_NAME: " + openAIFlagColLetter);

  for (var i = 0; i < transactionList.length; i++) {
    // Find Row of transaction
    var transactionIDRange = sheet.getRange(transactionIDColumnLetter + ":" + transactionIDColumnLetter);
    var textFinder = transactionIDRange.createTextFinder(transactionList[i]["transaction_id"]);
    var match = textFinder.findNext();
    if (match != null) {
      var transactionRow = match.getRowIndex();

      // Set Updated Category
      var categoryRangeString = categoryColumnLetter + transactionRow;

      try {
        var categoryRange = sheet.getRange(categoryRangeString);

        var updatedCategory = transactionList[i]["category"];
        if (!categoryList.includes(updatedCategory)) {
          updatedCategory = FALLBACK_CATEGORY;
        }
        
        categoryRange.setValue(updatedCategory);
      } catch (error) {
        Logger.log(error);
      }


      // Set Updated Description
      var descRangeString = descriptionColumnLetter + transactionRow;

      try {
        var descRange = sheet.getRange(descRangeString);
        descRange.setValue(transactionList[i]["updated_description"]);
      } catch (error) {
        Logger.log(error);
      }
      // Set Updated Tags
      var tagRangeString = tagsIDColumnLetter + transactionRow;

      try {
        var tagRange = sheet.getRange(tagRangeString);
        tagRange.setValue(transactionList[i]["tags"]);
      } catch (error) {
        Logger.log(error);
      }



      // Mark Open AI Flag
      if (openAIFlagColLetter != null) {
        var openAIFlagRangeString = openAIFlagColLetter + transactionRow;

        try {
          var openAIFlagRange = sheet.getRange(openAIFlagRangeString);
          openAIFlagRange.setValue("TRUE");
        } catch (error) {
          Logger.log(error);
        }
      }
    }
  }
}

function getAllowedCategories() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var categorySheet = spreadsheet.getSheetByName(CATEGORY_SHEET_NAME)
  var headers = categorySheet.getRange("1:1").getValues()[0];

  var categoryColLetter = getColumnLetterFromColumnHeader(headers, CATEGORY_COL_NAME);

  var categoryListRaw = categorySheet.getRange(categoryColLetter + "2:" + categoryColLetter).getValues();

  var categoryList = []
  for (var i = 0; i < categoryListRaw.length; i++) {
    categoryList.push(categoryListRaw[i][0]);
  }
  return categoryList;
}

function getColumnLetterFromColumnHeader(columnHeaders, columnName) {
  var columnIndex = columnHeaders.indexOf(columnName);
  var columnLetter = "";

    let base = 26;
    let letterCharCodeBase = 'A'.charCodeAt(0);

    while (columnIndex >= 0) {
        columnLetter = String.fromCharCode(columnIndex % base + letterCharCodeBase) + columnLetter;
        columnIndex = Math.floor(columnIndex / base) - 1;
    }

    return columnLetter;
}

function lookupDescAndCategory (transactionList, categoryList, model='gpt-4-1106-preview') {
  var transactionDict = {
    "transactions": transactionList
  };

  const request = {
    model: model,
    temperature: 0.05,
    top_p: 0.1,
    seed: 1,
    response_format: {"type": "json_object"},
    messages: [
      {
        role: 'system',
        content: 'Act as an API that categorizes and cleans up bank transaction descriptions for for a personal finance app.'
      },
      {
        role: 'system',
        content: 'Reference the following list of allowed_categories:\n' + JSON.stringify(categoryList)
      },
      {
        role: 'system',
        content: 'You will be given JSON input with a list of transaction descriptions and potentially related previously categorized transactions in the following format: \
            {"transactions": [\
              {\
                "transaction_id": "A unique ID for this transaction"\
                "original_description": "The original raw transaction description",\
                "previous_transactions": "(optional) Previously cleaned up transaction descriptions and the prior \
                category used that may be related to this transaction\
              }\
            ]}\n\
            For each transaction provided, follow these instructions:\n\
            (0) If previous_transactions were provided, see if the current transaction matches a previous one closely. \
                If it does, use the updated_description and category of the previous transaction exactly, \
                including capitalization and punctuation.\
            (1) If there is no matching previous_transaction, or none was provided suggest a better “updated_description” according to the following rules:\n\
            (a) Use all of your knowledge and information to propose a friendly, human readable updated_description for the \
              transaction given the original_description. The input often contains the name of a merchant name. \
              If you know of a merchant it might be referring to, use the name of that merchant for the suggested description.\n\
            (b) Keep the suggested description as simple as possible. Remove punctuation, extraneous \
              numbers, location information, abbreviations such as "Inc." or "LLC", IDs and account numbers.\n\
            (2) For each original_description, suggest a “category” for the transaction from the allowed_categories list that was provided.\n\
            (2a) Heavily weight previously categorized transactions is selecting new recommended category, and only if there is not a good suggestion then select a different category\n\
            (3) If you are not confident in the suggested category after using your own knowledge and the previous transactions provided, use the cateogry "' + FALLBACK_CATEGORY + '"\n\n\
            (4) For tags, refer to the previous tags that were used and previous tags have the most weight.   You can use the list of the allowed_categories or general categories also.  Dont reuse the category that was selected. \
            (4a) Heavily weight previously tagged transactions is selecting new recommended tags.\n\
            (5) Your response should be a JSON object and no other text.  The response object should be of the form:\n\
            {"suggested_transactions": [\
              {\
                "transaction_id": "The unique ID previously provided for this transaction",\
                "updated_description": "The cleaned up version of the description",\
                "category": "A category selected from the allowed_categories list",\
                "tags": "A comma seperated list of proposed tags from the No more than 2"\
              }\
            ]}'
      },
      {
        role: 'user',
        content: JSON.stringify(transactionDict)
      }
    ]
  };

  const jsonRequest = JSON.stringify(request);

  const options = {
    method: 'POST',
    contentType: 'application/json',
    headers: {'Authorization': 'Bearer ' + OPENAI_API_KEY},
    payload: jsonRequest,
    muteHttpExceptions: true,
  };

  var response = UrlFetchApp.fetch("https://api.openai.com/v1/chat/completions", options).getContentText();
  var parsedResponse = JSON.parse(response);

  if ("error" in parsedResponse) {
    Logger.log("Error from Open AI: " + parsedResponse["error"]["message"]);

    return null;
  } else {
    var apiResponse = JSON.parse(parsedResponse["choices"][0]["message"]["content"]);
    return apiResponse["suggested_transactions"];
  }
}
