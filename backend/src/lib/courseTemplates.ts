// Offline course templates: the SEED path of the course generator. When OpenAI
// is disabled (the default) or fails, the generator picks the template whose
// keywords match the requested topic, so the demo always produces a real,
// multi-lesson course with working quizzes and no network access.
//
// Content is deliberately textbook-level and stable (protocol behaviour, SQL
// semantics, Python language rules) so it does not go stale between releases.

export interface QuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
}

export interface LessonTemplate {
  title: string;
  content: string;
  keyPoints: string[];
  quiz: QuizQuestion[];
}

export interface CourseTemplate {
  key: string;
  // Lower-case fragments matched against the topic (substring match).
  keywords: string[];
  title: string;
  cognitiveCategory: "Analytical" | "Verbal" | "Technical" | "General";
  description: string;
  lessons: LessonTemplate[];
}

const NETWORKING: CourseTemplate = {
  key: "networking",
  keywords: ["network", "subnet", "tcp", "udp", "routing", "ospf", "vlan", "dns", "osi", "ccna", "packet", "ip address"],
  title: "Networking Fundamentals",
  cognitiveCategory: "Analytical",
  description: "How data moves between machines: layered models, addressing, subnetting, transport and routing.",
  lessons: [
    {
      title: "The OSI and TCP/IP models",
      content:
        "Network communication is split into layers so each layer solves one problem and relies on the layer below it. The OSI model has seven layers: Physical, Data Link, Network, Transport, Session, Presentation and Application. The TCP/IP model that the internet actually runs on collapses these into four: Link, Internet, Transport and Application.\n\nAs data travels down the stack it is encapsulated: the application's data gets a transport header (a segment), then an IP header (a packet), then a frame header and trailer at the link layer. The receiver strips the headers in reverse order.\n\nThinking in layers is the core troubleshooting skill: if a cable is unplugged (layer 1) no amount of DNS debugging (layer 7) will help.",
      keyPoints: [
        "OSI has 7 layers; TCP/IP has 4.",
        "Encapsulation wraps data as segment, then packet, then frame.",
        "Each layer only talks to the layer directly above and below it.",
        "Troubleshoot bottom-up: physical before application.",
      ],
      quiz: [
        { question: "Which OSI layer is responsible for logical (IP) addressing and routing?", options: ["Data Link", "Network", "Transport", "Session"], answerIndex: 1 },
        { question: "What is the PDU called at the Transport layer when using TCP?", options: ["Frame", "Packet", "Segment", "Bit"], answerIndex: 2 },
        { question: "How many layers does the TCP/IP model have?", options: ["4", "5", "7", "3"], answerIndex: 0 },
      ],
    },
    {
      title: "IPv4 addressing and subnet masks",
      content:
        "An IPv4 address is 32 bits, written as four decimal octets such as 192.168.10.25. A subnet mask splits it into a network portion and a host portion. In CIDR notation, /24 means the first 24 bits are network bits, equal to the mask 255.255.255.0.\n\nIn every subnet the first address (all host bits 0) is the network address and the last (all host bits 1) is the broadcast address, so neither can be assigned to a host. The number of usable hosts is 2^(host bits) - 2.\n\nPrivate ranges defined in RFC 1918 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) are not routed on the public internet and are reached from outside through NAT.",
      keyPoints: [
        "IPv4 addresses are 32 bits in four octets.",
        "/24 = 255.255.255.0 = 24 network bits.",
        "Usable hosts = 2^host_bits - 2 (network and broadcast are reserved).",
        "RFC 1918 private ranges: 10/8, 172.16/12, 192.168/16.",
      ],
      quiz: [
        { question: "How many usable host addresses are in a /26 subnet?", options: ["64", "62", "30", "126"], answerIndex: 1 },
        { question: "Which mask is equivalent to /24?", options: ["255.255.0.0", "255.255.255.128", "255.255.255.0", "255.0.0.0"], answerIndex: 2 },
        { question: "Which of these is a private (RFC 1918) address?", options: ["172.20.1.5", "8.8.8.8", "172.32.0.1", "192.169.1.1"], answerIndex: 0 },
      ],
    },
    {
      title: "Subnetting and VLSM",
      content:
        "Subnetting borrows host bits to create more, smaller networks. Borrowing n bits from a network creates 2^n subnets. For example, splitting 192.168.1.0/24 into four subnets borrows 2 bits, giving four /26 networks: .0, .64, .128 and .192, each with 62 usable hosts.\n\nThe block size (the gap between subnet addresses) is 256 minus the value of the interesting octet in the mask. For /26 the mask's last octet is 192, so the block size is 64.\n\nVariable Length Subnet Masking (VLSM) uses different prefix lengths inside one address block so each link gets only the addresses it needs: allocate the largest subnets first, then carve smaller ones (for example /30 for point-to-point links) from what remains.",
      keyPoints: [
        "Borrowing n bits creates 2^n subnets.",
        "Block size = 256 - interesting mask octet.",
        "VLSM: different prefix lengths in one block.",
        "Allocate largest subnets first to avoid overlap.",
      ],
      quiz: [
        { question: "What is the block size for a /27 mask (255.255.255.224)?", options: ["16", "32", "64", "8"], answerIndex: 1 },
        { question: "Which prefix gives exactly 2 usable hosts, ideal for a point-to-point link?", options: ["/29", "/31 in all cases", "/30", "/28"], answerIndex: 2 },
        { question: "In VLSM, which subnets should you allocate first?", options: ["The smallest", "The largest", "Alphabetical order", "It does not matter"], answerIndex: 1 },
      ],
    },
    {
      title: "TCP vs UDP",
      content:
        "The transport layer offers two main protocols. TCP is connection-oriented: it sets up a session with a three-way handshake (SYN, SYN-ACK, ACK), numbers every byte, retransmits lost segments and delivers data in order. That reliability costs latency and header overhead.\n\nUDP is connectionless: it sends datagrams with no handshake, no acknowledgements and no ordering. It is used where speed matters more than perfect delivery, such as DNS queries, VoIP and online games, or where the application handles reliability itself.\n\nPort numbers identify the application on each end. Well-known ports include 22 (SSH), 53 (DNS), 80 (HTTP) and 443 (HTTPS).",
      keyPoints: [
        "TCP: handshake, sequencing, retransmission, ordered delivery.",
        "UDP: no handshake, lower overhead, no delivery guarantee.",
        "Handshake order: SYN, SYN-ACK, ACK.",
        "Ports identify applications: 22 SSH, 53 DNS, 443 HTTPS.",
      ],
      quiz: [
        { question: "What is the correct order of the TCP three-way handshake?", options: ["ACK, SYN, SYN-ACK", "SYN, ACK, SYN-ACK", "SYN, SYN-ACK, ACK", "SYN-ACK, SYN, ACK"], answerIndex: 2 },
        { question: "Which protocol suits a real-time voice call best?", options: ["TCP", "UDP", "FTP", "SMTP"], answerIndex: 1 },
        { question: "Which port does HTTPS use by default?", options: ["80", "22", "443", "8080"], answerIndex: 2 },
      ],
    },
    {
      title: "Routing and OSPF basics",
      content:
        "A router forwards packets between networks by looking up the destination address in its routing table and choosing the most specific match (longest prefix match). Routes come from directly connected interfaces, static routes typed by an administrator, or dynamic routing protocols.\n\nOSPF is a link-state interior gateway protocol. Each router floods link-state advertisements so all routers in an area share the same map of the topology, then each one runs Dijkstra's shortest path first algorithm to compute its best routes. OSPF's metric is cost, derived from interface bandwidth.\n\nLarge OSPF networks are split into areas connected to a backbone, area 0, which limits how far topology changes ripple.",
      keyPoints: [
        "Routers choose the longest prefix match.",
        "Routes: connected, static or dynamic.",
        "OSPF is link-state and runs Dijkstra's SPF algorithm.",
        "All OSPF areas connect to backbone area 0.",
      ],
      quiz: [
        { question: "A router has routes for 10.0.0.0/8 and 10.1.0.0/16. Which is used for 10.1.5.9?", options: ["10.0.0.0/8", "10.1.0.0/16", "Both, load-balanced", "Neither"], answerIndex: 1 },
        { question: "What algorithm does OSPF use to compute routes?", options: ["Bellman-Ford", "Dijkstra SPF", "Round robin", "Spanning tree"], answerIndex: 1 },
        { question: "What is the OSPF backbone area number?", options: ["1", "0", "255", "100"], answerIndex: 1 },
      ],
    },
  ],
};

const DATABASES: CourseTemplate = {
  key: "databases",
  keywords: ["database", "sql", "join", "normali", "erd", "postgres", "mysql", "query", "relational", "index"],
  title: "Relational Databases and SQL",
  cognitiveCategory: "Technical",
  description: "Model data with tables and keys, query it with SQL, and keep it consistent and fast.",
  lessons: [
    {
      title: "Tables, keys and relationships",
      content:
        "A relational database stores data in tables (relations) made of rows and columns. Every table should have a primary key: a column or set of columns whose value uniquely identifies each row and is never null.\n\nA foreign key is a column that references the primary key of another table, which is how relationships are expressed. A one-to-many relationship (one customer, many orders) puts the foreign key on the 'many' side. A many-to-many relationship (students and courses) needs a junction table holding two foreign keys.\n\nForeign key constraints let the database enforce referential integrity: you cannot insert an order for a customer that does not exist, and you choose what happens on delete (restrict, cascade or set null).",
      keyPoints: [
        "Primary key: unique, not null, identifies a row.",
        "Foreign key: references another table's primary key.",
        "One-to-many: foreign key on the many side.",
        "Many-to-many: use a junction table.",
      ],
      quiz: [
        { question: "Where does the foreign key go in a one-to-many relationship?", options: ["On the one side", "On the many side", "In both tables", "In a junction table only"], answerIndex: 1 },
        { question: "What is required to model a many-to-many relationship?", options: ["A view", "An index", "A junction table", "A trigger"], answerIndex: 2 },
        { question: "Which property must a primary key have?", options: ["It can be null", "It must be unique and not null", "It must be text", "It must be the first column"], answerIndex: 1 },
      ],
    },
    {
      title: "SELECT, WHERE and ORDER BY",
      content:
        "SQL is declarative: you describe the result you want and the query planner decides how to get it. The core query is SELECT columns FROM table WHERE condition ORDER BY column.\n\nWHERE filters rows before any grouping. Comparisons with NULL need IS NULL or IS NOT NULL, because NULL = NULL is not true in SQL (it evaluates to unknown). ORDER BY sorts the result, ascending by default, and LIMIT restricts how many rows come back.\n\nThe logical order of evaluation is FROM, WHERE, GROUP BY, HAVING, SELECT, ORDER BY, LIMIT, which explains why a column alias defined in SELECT cannot be used in WHERE.",
      keyPoints: [
        "SQL is declarative; the planner picks the execution strategy.",
        "Use IS NULL, never = NULL.",
        "Logical order: FROM, WHERE, GROUP BY, HAVING, SELECT, ORDER BY.",
        "ORDER BY defaults to ascending.",
      ],
      quiz: [
        { question: "How do you find rows where email is missing?", options: ["WHERE email = NULL", "WHERE email IS NULL", "WHERE email == ''", "WHERE NULL(email)"], answerIndex: 1 },
        { question: "Which clause is logically evaluated first?", options: ["SELECT", "ORDER BY", "FROM", "WHERE"], answerIndex: 2 },
        { question: "What is the default sort direction of ORDER BY?", options: ["Descending", "Ascending", "Random", "Insertion order"], answerIndex: 1 },
      ],
    },
    {
      title: "JOINs",
      content:
        "JOINs combine rows from two tables using a condition, usually foreign key = primary key. An INNER JOIN returns only rows that have a match in both tables.\n\nA LEFT JOIN returns every row from the left table and the matching rows from the right; where there is no match, the right-hand columns are NULL. That makes LEFT JOIN plus WHERE right.id IS NULL the standard way to find rows with no related record, such as customers with no orders.\n\nA FULL OUTER JOIN keeps unmatched rows from both sides, and a CROSS JOIN returns every combination (the Cartesian product), which is rarely what you want by accident.",
      keyPoints: [
        "INNER JOIN: only matching rows.",
        "LEFT JOIN: all left rows, NULLs where no match.",
        "LEFT JOIN ... WHERE right.id IS NULL finds orphans.",
        "CROSS JOIN produces the Cartesian product.",
      ],
      quiz: [
        { question: "Which join returns all customers, including those with no orders?", options: ["INNER JOIN", "LEFT JOIN customers to orders", "CROSS JOIN", "SELF JOIN"], answerIndex: 1 },
        { question: "A CROSS JOIN of a 10-row and a 5-row table returns how many rows?", options: ["15", "10", "50", "5"], answerIndex: 2 },
        { question: "In a LEFT JOIN, unmatched right-side columns are filled with:", options: ["0", "Empty strings", "NULL", "The left values"], answerIndex: 2 },
      ],
    },
    {
      title: "Aggregation with GROUP BY and HAVING",
      content:
        "Aggregate functions such as COUNT, SUM, AVG, MIN and MAX collapse many rows into one value. GROUP BY splits rows into groups first, so SELECT subject, COUNT(*) FROM tasks GROUP BY subject returns one row per subject.\n\nEvery column in the SELECT list must either be in the GROUP BY or be wrapped in an aggregate. WHERE filters rows before grouping; HAVING filters groups after aggregation, so 'subjects with more than five tasks' needs HAVING COUNT(*) > 5.\n\nCOUNT(*) counts rows, while COUNT(column) counts only non-null values in that column, a common source of off-by-some errors.",
      keyPoints: [
        "GROUP BY produces one row per group.",
        "WHERE filters rows; HAVING filters groups.",
        "Non-aggregated SELECT columns must appear in GROUP BY.",
        "COUNT(column) skips NULLs; COUNT(*) does not.",
      ],
      quiz: [
        { question: "Which clause filters on an aggregate like COUNT(*) > 5?", options: ["WHERE", "HAVING", "ORDER BY", "LIMIT"], answerIndex: 1 },
        { question: "COUNT(email) on 10 rows where 3 emails are NULL returns:", options: ["10", "3", "7", "NULL"], answerIndex: 2 },
        { question: "When does WHERE apply relative to GROUP BY?", options: ["After", "Before", "At the same time", "Only with HAVING"], answerIndex: 1 },
      ],
    },
    {
      title: "Normalization and indexes",
      content:
        "Normalization removes redundancy so each fact is stored once. First normal form (1NF) requires atomic values and no repeating groups. Second normal form (2NF) removes partial dependencies on part of a composite key. Third normal form (3NF) removes transitive dependencies, where a non-key column depends on another non-key column.\n\nRedundant data causes update anomalies: change a lecturer's office in one row and forget another, and the database now disagrees with itself.\n\nIndexes, usually B-trees, speed up lookups on the indexed columns at the cost of extra storage and slower writes. Index columns you filter or join on frequently; primary keys and unique constraints are indexed automatically in PostgreSQL.",
      keyPoints: [
        "1NF: atomic values, no repeating groups.",
        "2NF: no partial dependency on a composite key.",
        "3NF: no transitive dependencies.",
        "Indexes speed reads but slow writes.",
      ],
      quiz: [
        { question: "Which normal form removes transitive dependencies?", options: ["1NF", "2NF", "3NF", "BCNF only"], answerIndex: 2 },
        { question: "What is the main cost of adding an index?", options: ["Slower reads", "Slower writes and extra storage", "Data loss", "It disables foreign keys"], answerIndex: 1 },
        { question: "Storing the same fact in many rows risks:", options: ["Update anomalies", "Faster queries", "Deadlocks only", "Nothing"], answerIndex: 0 },
      ],
    },
  ],
};

const PYTHON: CourseTemplate = {
  key: "python",
  keywords: ["python", "programming", "coding", "script", "code"],
  title: "Python Programming Essentials",
  cognitiveCategory: "Technical",
  description: "Core Python: data types, control flow, functions, collections and error handling.",
  lessons: [
    {
      title: "Variables and data types",
      content:
        "Python is dynamically typed: a variable is a name bound to an object, and the object carries the type. The core built-in types are int, float, str, bool and None, plus the collections list, tuple, dict and set.\n\nSome types are mutable (list, dict, set) and can change in place; others are immutable (int, str, tuple), so 'modifying' them creates a new object. This matters when two names point to the same list: changing it through one name is visible through the other.\n\nUse type() to inspect an object's type and isinstance() to check it, since isinstance also respects inheritance.",
      keyPoints: [
        "Names are bound to objects; objects carry types.",
        "list, dict, set are mutable; str, int, tuple are immutable.",
        "Two names can reference the same mutable object.",
        "Prefer isinstance() over comparing type() directly.",
      ],
      quiz: [
        { question: "Which of these types is immutable?", options: ["list", "dict", "tuple", "set"], answerIndex: 2 },
        { question: "a = [1]; b = a; b.append(2). What is a?", options: ["[1]", "[1, 2]", "[2]", "Error"], answerIndex: 1 },
        { question: "What does type(3.0) return?", options: ["int", "float", "str", "decimal"], answerIndex: 1 },
      ],
    },
    {
      title: "Control flow",
      content:
        "Python uses indentation to define blocks, so consistent spacing is syntax, not style. if / elif / else chooses a branch; the first true condition wins.\n\nfor loops iterate over any iterable (a list, a string, range(n), a dict's keys). range(n) yields 0 up to n - 1. while loops repeat while a condition stays true, so make sure something in the body changes it.\n\nbreak exits the innermost loop immediately and continue skips to the next iteration. A loop's else block runs only if the loop finished without hitting break, which is handy for search loops.",
      keyPoints: [
        "Indentation defines blocks.",
        "range(n) yields 0 .. n-1.",
        "break exits the loop; continue skips an iteration.",
        "for/else: else runs only when no break occurred.",
      ],
      quiz: [
        { question: "What does list(range(3)) produce?", options: ["[1, 2, 3]", "[0, 1, 2]", "[0, 1, 2, 3]", "[3]"], answerIndex: 1 },
        { question: "Which statement skips to the next loop iteration?", options: ["break", "pass", "continue", "return"], answerIndex: 2 },
        { question: "When does a for loop's else block run?", options: ["Always", "Only if break was hit", "Only if the loop ended without break", "Never"], answerIndex: 2 },
      ],
    },
    {
      title: "Functions",
      content:
        "Functions are defined with def and return a value with return; a function with no return statement returns None. Parameters can have default values, and callers can pass arguments by keyword for clarity.\n\nA classic trap: default values are evaluated once, when the function is defined. A mutable default such as def add(item, items=[]) shares the same list across calls. Use items=None and create the list inside instead.\n\n*args collects extra positional arguments into a tuple and **kwargs collects extra keyword arguments into a dict. Variables assigned inside a function are local unless declared global or nonlocal.",
      keyPoints: [
        "No return statement means the function returns None.",
        "Default values are evaluated once at definition time.",
        "Never use a mutable default argument.",
        "*args is a tuple; **kwargs is a dict.",
      ],
      quiz: [
        { question: "What does a function without a return statement return?", options: ["0", "None", "An empty string", "It raises an error"], answerIndex: 1 },
        { question: "Why is def f(x=[]) risky?", options: ["Lists cannot be defaults", "The same list is shared across calls", "It is slower", "It is a syntax error"], answerIndex: 1 },
        { question: "Inside def f(**kwargs), kwargs is a:", options: ["list", "tuple", "dict", "set"], answerIndex: 2 },
      ],
    },
    {
      title: "Lists, dicts and comprehensions",
      content:
        "Lists are ordered and indexable; negative indexes count from the end, so items[-1] is the last element. Slicing items[a:b] returns a new list from index a up to but not including b.\n\nDictionaries map unique, hashable keys to values with average O(1) lookup. d.get(key, default) avoids a KeyError when the key may be missing. Sets store unique values and make membership tests fast.\n\nComprehensions build collections concisely: [x * x for x in nums if x > 0] creates a list of squares of the positive numbers, and {k: v for k, v in pairs} builds a dict.",
      keyPoints: [
        "items[-1] is the last element.",
        "Slices exclude the end index.",
        "dict.get avoids KeyError.",
        "Comprehensions: [expr for x in xs if cond].",
      ],
      quiz: [
        { question: "nums = [10, 20, 30, 40]. What is nums[1:3]?", options: ["[10, 20, 30]", "[20, 30]", "[20, 30, 40]", "[10, 20]"], answerIndex: 1 },
        { question: "Which call returns 0 instead of raising when 'x' is missing from d?", options: ["d['x']", "d.get('x', 0)", "d.pop('x')", "d.x"], answerIndex: 1 },
        { question: "[n for n in range(5) if n % 2 == 0] equals:", options: ["[0, 2, 4]", "[1, 3]", "[2, 4]", "[0, 1, 2, 3, 4]"], answerIndex: 0 },
      ],
    },
    {
      title: "Errors and exceptions",
      content:
        "Runtime errors in Python are raised as exceptions. try / except catches them so the program can recover; catch the most specific exception you expect, such as ValueError or FileNotFoundError, rather than a bare except, which also hides bugs.\n\nelse runs when the try block raised nothing, and finally always runs, which makes it the place for cleanup. The with statement does that cleanup automatically for files and other context managers.\n\nRaise your own exceptions with raise ValueError('message') when a function receives input it cannot handle; failing loudly beats returning a wrong answer.",
      keyPoints: [
        "Catch specific exceptions, not bare except.",
        "finally always runs; use it for cleanup.",
        "with closes files automatically.",
        "Raise exceptions on invalid input.",
      ],
      quiz: [
        { question: "int('abc') raises which exception?", options: ["TypeError", "ValueError", "KeyError", "IndexError"], answerIndex: 1 },
        { question: "Which block always runs, error or not?", options: ["else", "except", "finally", "try"], answerIndex: 2 },
        { question: "Why avoid a bare except:?", options: ["It is slower", "It hides unexpected bugs", "It is invalid syntax", "It only catches KeyError"], answerIndex: 1 },
      ],
    },
  ],
};

const SECURITY: CourseTemplate = {
  key: "security",
  keywords: ["security", "cyber", "pentest", "hacking", "owasp", "encrypt", "crypto", "malware", "soc", "threat"],
  title: "Cybersecurity Foundations",
  cognitiveCategory: "Technical",
  description: "Core security principles, authentication, cryptography, common web vulnerabilities and detection.",
  lessons: [
    {
      title: "The CIA triad and risk",
      content:
        "Security goals are summarised by the CIA triad: Confidentiality (only authorised people can read data), Integrity (data is not altered without authorisation) and Availability (systems and data are there when needed).\n\nRisk combines likelihood and impact. A vulnerability is a weakness, a threat is something that could exploit it, and a control reduces the risk, for example encryption for confidentiality, hashing and signatures for integrity, and redundancy and backups for availability.\n\nDefence in depth layers several independent controls so that one failure does not mean a breach.",
      keyPoints: [
        "CIA: Confidentiality, Integrity, Availability.",
        "Risk = likelihood x impact.",
        "Vulnerability = weakness; threat = potential exploiter.",
        "Defence in depth layers independent controls.",
      ],
      quiz: [
        { question: "A DDoS attack primarily targets which CIA property?", options: ["Confidentiality", "Integrity", "Availability", "Authentication"], answerIndex: 2 },
        { question: "Backups mainly protect:", options: ["Availability", "Confidentiality", "Non-repudiation", "Anonymity"], answerIndex: 0 },
        { question: "What is defence in depth?", options: ["One very strong firewall", "Multiple independent layers of controls", "Encrypting everything twice", "Hiding the server"], answerIndex: 1 },
      ],
    },
    {
      title: "Authentication and password storage",
      content:
        "Authentication proves who you are; authorisation decides what you may do. Multi-factor authentication combines factors from different categories: something you know, have or are.\n\nPasswords must never be stored in plain text or with fast hashes like MD5 or SHA-256 alone. Use a slow, salted password hashing function such as bcrypt, scrypt or Argon2. The salt makes identical passwords hash differently and defeats precomputed rainbow tables; the work factor makes brute force expensive.\n\nLogin responses should not reveal whether the username or the password was wrong, otherwise attackers can enumerate valid accounts.",
      keyPoints: [
        "Authentication = who you are; authorisation = what you can do.",
        "MFA mixes know / have / are factors.",
        "Store passwords with bcrypt, scrypt or Argon2.",
        "Generic login errors prevent account enumeration.",
      ],
      quiz: [
        { question: "Which is appropriate for storing passwords?", options: ["MD5", "Base64", "bcrypt", "Plain text over HTTPS"], answerIndex: 2 },
        { question: "What does a salt defeat?", options: ["Phishing", "Rainbow tables", "Keyloggers", "DDoS"], answerIndex: 1 },
        { question: "A password plus a phone authenticator app is an example of:", options: ["Single-factor", "Multi-factor authentication", "Authorisation", "Encryption"], answerIndex: 1 },
      ],
    },
    {
      title: "Cryptography basics",
      content:
        "Symmetric encryption (for example AES) uses the same key to encrypt and decrypt; it is fast but both sides need the key. Asymmetric encryption (for example RSA or elliptic curve) uses a public key to encrypt or verify and a private key to decrypt or sign.\n\nHashing is one-way: you cannot recover the input from a hash, which is why it is used for integrity checks and password storage rather than for hiding data you need back.\n\nTLS combines both: asymmetric cryptography authenticates the server and agrees on a session key, then fast symmetric encryption protects the traffic.",
      keyPoints: [
        "Symmetric: one shared key, fast (AES).",
        "Asymmetric: public/private key pair (RSA, ECC).",
        "Hashing is one-way, not encryption.",
        "TLS uses asymmetric crypto to set up a symmetric session key.",
      ],
      quiz: [
        { question: "AES is an example of:", options: ["Asymmetric encryption", "Symmetric encryption", "A hash function", "A key exchange protocol"], answerIndex: 1 },
        { question: "To verify a digital signature you use the signer's:", options: ["Private key", "Public key", "Password", "Session key"], answerIndex: 1 },
        { question: "Can you decrypt a SHA-256 hash to get the original input?", options: ["Yes, with the key", "No, hashing is one-way", "Only with RSA", "Only for short inputs"], answerIndex: 1 },
      ],
    },
    {
      title: "Common web vulnerabilities",
      content:
        "SQL injection happens when user input is concatenated into a query, letting an attacker change the query's logic. The fix is parameterised queries (prepared statements), where input is always sent as data, never as SQL.\n\nCross-site scripting (XSS) happens when untrusted input is rendered as HTML or script in another user's browser. Output encoding and a Content Security Policy are the main defences.\n\nBroken access control, the top category in the OWASP Top 10 (2021), covers users reaching data or functions they should not, such as changing an ID in a URL to read someone else's record. The fix is checking authorisation on the server for every request.",
      keyPoints: [
        "SQL injection: fix with parameterised queries.",
        "XSS: encode output, add a CSP.",
        "Broken access control: enforce authorisation server-side.",
        "Never trust client-side checks alone.",
      ],
      quiz: [
        { question: "What is the primary defence against SQL injection?", options: ["Hiding error messages", "Parameterised queries", "Using POST instead of GET", "Client-side validation"], answerIndex: 1 },
        { question: "Changing /invoice/101 to /invoice/102 and seeing another user's invoice is:", options: ["XSS", "CSRF", "Broken access control (IDOR)", "SQL injection"], answerIndex: 2 },
        { question: "Which header helps mitigate XSS?", options: ["Content-Security-Policy", "Content-Length", "Accept-Encoding", "ETag"], answerIndex: 0 },
      ],
    },
    {
      title: "Logging, detection and response",
      content:
        "You cannot respond to what you cannot see. Security logging should capture authentication events, privilege changes, admin actions and errors, with accurate timestamps, while never logging secrets such as passwords or tokens.\n\nA SIEM collects logs centrally and runs detection rules, for example many failed logins from one IP in a short window (brute force) or a login followed by an admin role change.\n\nIncident response follows a cycle: preparation, detection and analysis, containment, eradication, recovery, and lessons learned. Backups that are tested by actually restoring them are a core recovery control.",
      keyPoints: [
        "Log auth events, privilege changes and admin actions.",
        "Never log passwords or tokens.",
        "A SIEM centralises logs and runs detection rules.",
        "IR: prepare, detect, contain, eradicate, recover, learn.",
      ],
      quiz: [
        { question: "Which should never appear in logs?", options: ["Timestamps", "Usernames", "Plain-text passwords", "Source IPs"], answerIndex: 2 },
        { question: "Many failed logins from one IP in a minute suggests:", options: ["Normal use", "A brute-force attempt", "A backup job", "DNS failure"], answerIndex: 1 },
        { question: "Which incident response phase comes right after detection and analysis?", options: ["Recovery", "Containment", "Lessons learned", "Preparation"], answerIndex: 1 },
      ],
    },
  ],
};

const OPERATING_SYSTEMS: CourseTemplate = {
  key: "os",
  keywords: ["operating system", "process", "thread", "deadlock", "kernel", "linux", "memory management", "scheduling", "concurrency", " os"],
  title: "Operating Systems Core Concepts",
  cognitiveCategory: "Technical",
  description: "Processes, CPU scheduling, concurrency, deadlock and memory management.",
  lessons: [
    {
      title: "Processes and threads",
      content:
        "A process is a running program with its own address space, open files and resources. A thread is a unit of execution inside a process; threads of the same process share its memory, which makes communication cheap but requires synchronisation.\n\nThe OS tracks each process in a process control block (PCB) holding its state, registers, program counter and resource information. Switching the CPU from one process to another is a context switch: the OS saves one PCB's state and loads another's, which is pure overhead.\n\nProcess states are typically new, ready, running, waiting (blocked) and terminated.",
      keyPoints: [
        "Processes have separate address spaces; threads share one.",
        "The PCB stores a process's state.",
        "Context switches are overhead.",
        "States: new, ready, running, waiting, terminated.",
      ],
      quiz: [
        { question: "What do threads of the same process share?", options: ["Nothing", "The address space (memory)", "Only the stack", "Separate page tables"], answerIndex: 1 },
        { question: "Where is a process's saved register state kept?", options: ["The PCB", "The disk cache", "The TLB", "The BIOS"], answerIndex: 0 },
        { question: "A process waiting for disk I/O is in which state?", options: ["Running", "Ready", "Waiting (blocked)", "Terminated"], answerIndex: 2 },
      ],
    },
    {
      title: "CPU scheduling",
      content:
        "The scheduler decides which ready process runs next. First-Come First-Served (FCFS) is simple but suffers the convoy effect when a long job delays many short ones. Shortest Job First (SJF) minimises average waiting time but needs to know or estimate burst lengths and can starve long jobs.\n\nRound Robin gives each process a fixed time quantum and cycles through the ready queue. It is fair and responsive; a quantum that is too small wastes time on context switches, while one that is too large behaves like FCFS.\n\nPriority scheduling can starve low-priority processes; aging, which gradually raises the priority of waiting processes, prevents that.",
      keyPoints: [
        "FCFS: simple, convoy effect.",
        "SJF: optimal average wait, risk of starvation.",
        "Round Robin: time quantum, fair and responsive.",
        "Aging prevents starvation in priority scheduling.",
      ],
      quiz: [
        { question: "Which algorithm minimises average waiting time when burst lengths are known?", options: ["FCFS", "Round Robin", "SJF", "Random"], answerIndex: 2 },
        { question: "If the Round Robin quantum is very large, it behaves like:", options: ["SJF", "FCFS", "Priority", "Lottery"], answerIndex: 1 },
        { question: "What technique prevents starvation in priority scheduling?", options: ["Paging", "Aging", "Swapping", "Spooling"], answerIndex: 1 },
      ],
    },
    {
      title: "Synchronisation",
      content:
        "When threads share data, a race condition occurs if the result depends on the timing of their operations, for example two threads incrementing the same counter and losing an update.\n\nThe code that touches shared data is the critical section, and it needs mutual exclusion: only one thread inside at a time. A mutex (lock) provides that. A semaphore is a counter that allows up to N threads in, useful for limiting access to a pool of resources.\n\nLocks must be held for as short a time as possible, and always released, otherwise other threads block indefinitely.",
      keyPoints: [
        "Race condition: outcome depends on timing.",
        "Critical section needs mutual exclusion.",
        "Mutex = one at a time; semaphore = up to N.",
        "Hold locks briefly and always release them.",
      ],
      quiz: [
        { question: "Two threads do count += 1 without a lock and an update is lost. This is:", options: ["A deadlock", "A race condition", "Starvation", "Thrashing"], answerIndex: 1 },
        { question: "Which primitive allows up to N threads into a section?", options: ["Mutex", "Counting semaphore", "Spin flag", "Barrier"], answerIndex: 1 },
        { question: "The code that accesses shared data is called the:", options: ["Kernel", "Critical section", "Interrupt handler", "Page table"], answerIndex: 1 },
      ],
    },
    {
      title: "Deadlock",
      content:
        "A deadlock is a set of processes each waiting for a resource held by another, so none can proceed. Four conditions must all hold at once (the Coffman conditions): mutual exclusion, hold and wait, no preemption, and circular wait.\n\nPrevention breaks one condition, most practically circular wait, by acquiring locks in a fixed global order. Avoidance, such as the Banker's algorithm, only grants requests that keep the system in a safe state. Detection lets deadlocks happen, finds cycles in the wait-for graph and recovers by killing or rolling back a process.\n\nMany real systems simply use lock ordering and timeouts.",
      keyPoints: [
        "Coffman: mutual exclusion, hold and wait, no preemption, circular wait.",
        "Break circular wait with a global lock order.",
        "Banker's algorithm keeps the system in a safe state.",
        "Detection looks for cycles in a wait-for graph.",
      ],
      quiz: [
        { question: "How many Coffman conditions must hold for deadlock?", options: ["One", "Two", "All four", "Any three"], answerIndex: 2 },
        { question: "Acquiring locks in a fixed global order prevents which condition?", options: ["Mutual exclusion", "Circular wait", "No preemption", "Hold and wait"], answerIndex: 1 },
        { question: "The Banker's algorithm is a deadlock:", options: ["Prevention method", "Avoidance method", "Detection method", "Recovery method"], answerIndex: 1 },
      ],
    },
    {
      title: "Memory management and virtual memory",
      content:
        "Virtual memory gives every process its own address space, mapped to physical memory by the OS and the MMU. Paging splits memory into fixed-size pages and frames, removing external fragmentation; a page table maps page numbers to frame numbers, and the TLB caches recent translations.\n\nWhen a process touches a page not in RAM, a page fault occurs and the OS loads it from disk. If RAM is full, a page replacement algorithm picks a victim: LRU (least recently used) approximates the optimal choice well.\n\nIf processes keep faulting because their working sets do not fit in memory, the system spends its time swapping instead of computing. That is thrashing.",
      keyPoints: [
        "Paging removes external fragmentation.",
        "The TLB caches address translations.",
        "A page fault loads a missing page from disk.",
        "Thrashing: constant paging, little useful work.",
      ],
      quiz: [
        { question: "What caches recent virtual-to-physical translations?", options: ["The PCB", "The TLB", "The L3 cache only", "The scheduler"], answerIndex: 1 },
        { question: "Paging eliminates which kind of fragmentation?", options: ["Internal", "External", "Both", "Neither"], answerIndex: 1 },
        { question: "A system spending most of its time paging is:", options: ["Deadlocked", "Thrashing", "Starving", "Idle"], answerIndex: 1 },
      ],
    },
  ],
};

// Fallback for any topic without a dedicated template. It is honest about what
// it is: a structured study plan for the topic built on evidence-based learning
// techniques, not invented subject facts.
function genericTemplate(topic: string): CourseTemplate {
  const t = topic.trim();
  return {
    key: "generic",
    keywords: [],
    title: `Learning ${t}: a structured study plan`,
    cognitiveCategory: "General",
    description: `A step-by-step plan for learning ${t} using proven study techniques. Generated offline; enable the OpenAI parser for topic-specific lesson content.`,
    lessons: [
      {
        title: `Map the territory of ${t}`,
        content: `Before diving into details, sketch the shape of ${t}. List the main sub-topics, the vocabulary that keeps coming up, and what a competent person in ${t} can actually do. A syllabus, a textbook's table of contents or a course outline is a good starting point.\n\nThis map lets you place each new fact somewhere, which makes it far easier to remember than an isolated detail. It also shows you the order to learn things in: foundations first, specialisations later.`,
        keyPoints: [`Outline the main sub-topics of ${t}.`, "Collect the core vocabulary.", "Define what competence looks like.", "Learn foundations before specialisations."],
        quiz: [
          { question: "Why build a topic map before studying details?", options: ["It replaces studying", "New facts can be placed in context and are easier to remember", "It is required by exams", "It saves paper"], answerIndex: 1 },
          { question: "What is a good source for the structure of a subject?", options: ["A random video", "A syllabus or textbook table of contents", "Social media", "Your memory"], answerIndex: 1 },
          { question: "In what order should topics usually be learned?", options: ["Advanced first", "Foundations first", "Alphabetically", "Randomly"], answerIndex: 1 },
        ],
      },
      {
        title: "Active recall",
        content: `Re-reading notes feels productive but builds recognition, not recall. Active recall means closing the book and retrieving the information yourself: answer questions, write a summary from memory, or explain a ${t} concept out loud.\n\nThe effort of retrieval is what strengthens memory, a finding known as the testing effect. Turn each section of your ${t} notes into questions and test yourself on them.`,
        keyPoints: ["Re-reading builds recognition, not recall.", "Retrieve from memory instead.", "The testing effect strengthens memory.", "Convert notes into questions."],
        quiz: [
          { question: "Which technique is active recall?", options: ["Highlighting", "Re-reading", "Answering questions from memory", "Copying notes"], answerIndex: 2 },
          { question: "The benefit of retrieving information yourself is known as the:", options: ["Testing effect", "Placebo effect", "Halo effect", "Doppler effect"], answerIndex: 0 },
          { question: "A good way to use your notes is to:", options: ["Read them repeatedly", "Turn them into questions", "Colour-code them only", "Memorise page numbers"], answerIndex: 1 },
        ],
      },
      {
        title: "Spaced repetition",
        content: `Memories fade along a forgetting curve. Reviewing just as you are about to forget resets the curve and each review makes it flatter, so intervals can grow: one day, three days, a week, two weeks.\n\nCramming the night before can work for tomorrow but not for next month. Schedule short ${t} reviews across days; SchediQ's planner and daily limit are built for exactly this kind of spaced study.`,
        keyPoints: ["Memory decays along the forgetting curve.", "Review at growing intervals.", "Spaced study beats cramming for retention.", "Use the planner to schedule reviews."],
        quiz: [
          { question: "Spaced repetition schedules reviews:", options: ["All on one day", "At increasing intervals", "Only before exams", "Randomly"], answerIndex: 1 },
          { question: "Cramming is weakest for:", options: ["Tomorrow's test", "Long-term retention", "Short lists", "Nothing"], answerIndex: 1 },
          { question: "The forgetting curve describes:", options: ["How memory fades over time", "Exam difficulty", "Reading speed", "Sleep cycles"], answerIndex: 0 },
        ],
      },
      {
        title: "Practice and interleaving",
        content: `Understanding an explanation is not the same as being able to do it. Work through problems, exercises or projects in ${t}, and check your answers against a reliable source.\n\nInterleaving means mixing different problem types in one session instead of doing twenty of the same kind. It feels harder, but it trains you to choose the right method, which is exactly what exams and real work demand.`,
        keyPoints: ["Practise by doing, not just reading.", "Check answers against reliable sources.", "Interleave different problem types.", "Desirable difficulty improves learning."],
        quiz: [
          { question: "Interleaving means:", options: ["Studying one problem type at a time", "Mixing different problem types in a session", "Studying with music", "Taking long breaks"], answerIndex: 1 },
          { question: "Why does interleaving help?", options: ["It is easier", "It trains choosing the right method", "It is faster", "It avoids practice"], answerIndex: 1 },
          { question: "After solving practice problems you should:", options: ["Never check them", "Check against a reliable source", "Only check the easy ones", "Delete them"], answerIndex: 1 },
        ],
      },
      {
        title: "Teach it back (the Feynman technique)",
        content: `To test real understanding, explain a ${t} concept in plain language as if teaching a beginner. Wherever you get stuck or fall back on jargon is a gap in your understanding; go back to the source, fill it, and explain again.\n\nTeaching forces you to organise knowledge into a coherent story, which is the strongest sign you have learned it.`,
        keyPoints: ["Explain concepts in plain language.", "Gaps show up where you get stuck.", "Return to the source and retry.", "Teaching organises knowledge."],
        quiz: [
          { question: "The Feynman technique asks you to:", options: ["Memorise definitions", "Explain a concept simply as if teaching", "Read faster", "Skip difficult parts"], answerIndex: 1 },
          { question: "Falling back on jargon while explaining usually signals:", options: ["Mastery", "A gap in understanding", "Good vocabulary", "Nothing"], answerIndex: 1 },
          { question: "After finding a gap you should:", options: ["Move on", "Return to the source and re-explain", "Memorise the jargon", "Give up"], answerIndex: 1 },
        ],
      },
      {
        title: `Review and self-assessment for ${t}`,
        content: `Close the loop by measuring where you stand. Revisit your topic map from lesson one and rate each area: confident, shaky, or unknown. Spend your next study blocks on the shaky areas first; they give the biggest return.\n\nTrack this over time. In SchediQ, completed lessons, quiz scores and study sessions feed your subject mastery, so the dashboard shows whether ${t} is actually improving.`,
        keyPoints: ["Rate each area: confident, shaky, unknown.", "Prioritise shaky areas.", "Measure progress over time.", "Mastery combines lessons, quizzes and study time."],
        quiz: [
          { question: "Which areas should you study next for the biggest return?", options: ["The ones you know best", "The shaky ones", "Only new ones", "None"], answerIndex: 1 },
          { question: "Self-assessment should be done:", options: ["Once", "Repeatedly over time", "Never", "Only after the exam"], answerIndex: 1 },
          { question: "In SchediQ, subject mastery is built from:", options: ["Login count", "Lessons, quiz scores and study sessions", "Number of subjects", "Account tier"], answerIndex: 1 },
        ],
      },
    ],
  };
}

const TEMPLATES: CourseTemplate[] = [NETWORKING, DATABASES, PYTHON, SECURITY, OPERATING_SYSTEMS];

// Pick the template with the most keyword hits for the topic; the generic study
// plan when nothing matches. Padded with generic lessons if more lessons are
// requested than the template has.
export function pickTemplate(topic: string, lessonCount: number): CourseTemplate {
  const lower = ` ${topic.toLowerCase()} `;
  let best: CourseTemplate | null = null;
  let bestHits = 0;
  for (const t of TEMPLATES) {
    const hits = t.keywords.filter((k) => lower.includes(k)).length;
    if (hits > bestHits) {
      best = t;
      bestHits = hits;
    }
  }
  const generic = genericTemplate(topic);
  const chosen = best ?? generic;
  const lessons = [...chosen.lessons];
  for (const extra of generic.lessons) {
    if (lessons.length >= lessonCount) break;
    if (chosen !== generic) lessons.push(extra);
  }
  return { ...chosen, lessons: lessons.slice(0, lessonCount) };
}
