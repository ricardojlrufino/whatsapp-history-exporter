# whatsapp-history-exporter

Tool to export Whatsapp chat history emulating Whatsapp APP, using NodeJS + baileys whatsapp lib.

_Note: The code has not been extensively tested and needs revisions, but the basic functional part is OK._

# Init

> yarn install


## Extract data customization

Edit SyncConfig in `src/extract.ts`, to control exporter  ..

**Expor only contacs in list (optional):**

create a file named 'includeList.txt', add numbers one per line. 

# Extract Messages (to JSON)

> yarn run extract  

# Import JSON chats to Database (optional)

Create .env file with content: 

> DATABASE_URL="mysql://root:root@localhost:3306/whatsapp_db"  

## DB Init / Setup

> yarn prisma generate  
> yarn prisma db push  

## Start migrate

> yarn run migrate  

# TODO 

- [ ] export to txt
- [ ] view messages using: https://overbits.herokuapp.com/chatviewer/